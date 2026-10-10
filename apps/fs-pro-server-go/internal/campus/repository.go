// Package campus is the campus economy core (docs/coc-mapping/04): the Clubhouse
// tier gate, Groundskeepers (the build-slot bottleneck), collectors, vaults and
// the crossed two-currency cost model. economy.go holds the pure, table-testable
// rules; repository.go/handlers.go/router.go wire them to Postgres and HTTP.
package campus

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/facilities"
)

// Sentinel errors the handlers map to HTTP statuses. They are deliberately few
// and named after the condition, not the status.
var (
	ErrClubNotFound           = errors.New("club not found")
	ErrUnsupportedFacility    = errors.New("unsupported facility")
	ErrUnknownBuilding        = errors.New("unknown campus building")
	ErrInvalidPlacement       = errors.New("invalid placement")
	ErrAlreadyUpgrading       = errors.New("already upgrading")
	ErrAllBuildersBusy        = errors.New("all groundskeepers are busy")
	ErrInsufficientFunds      = errors.New("insufficient funds")
	ErrFacilityCapped         = errors.New("facility capped by clubhouse tier")
	ErrMaxLevel               = errors.New("already at maximum level")
	ErrClubhouseRequirements  = errors.New("clubhouse requirements not met")
	ErrNothingToCollect       = errors.New("nothing to collect")
	ErrObstacleNotFound       = errors.New("obstacle not found")
	ErrObstacleAlreadyCleared = errors.New("obstacle already cleared")
	ErrGroundskeeperEarned    = errors.New("groundskeeper is earned, not bought")
	ErrGroundskeepersMaxed    = errors.New("all groundskeepers already earned")
	ErrUnknownPerk            = errors.New("unknown board perk")
	ErrPerkUnavailable        = errors.New("that board perk is not in your inventory")
	ErrPerkTargetRequired     = errors.New("that board perk needs a target")
	ErrPerkTargetInvalid      = errors.New("invalid board perk target")
	ErrPerkTargetNotUpgrading = errors.New("that target has no upgrade in progress")
)

// facilityOrder is the canonical, deterministic order of the campus economy
// facilities (Go map iteration is unordered, so a UI/test/diff needs this).
var facilityOrder = []string{
	"clubhouse", "turnstiles", "club_shop", "cash_vault", "fan_vault",
	"coaching_dept", "video_analysis",
}

// Repository is the pgx-backed campus store. Reads use the column-keyed map
// passthrough (db.ScanOne/ScanAll); every mutation runs in a transaction and
// writes a TransferLedger row.
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// Q exposes the querier (access checks / ad-hoc reads).
func (r *Repository) Q() db.Querier { return r.q }

// clubColumns are the campus-relevant Clubs fields.
const clubColumns = `"_id", "Name", "ClubCode", "Budget", "Fans", "ScoutTokens", "SponsorCredits",
	"ClubhouseTier", "CollectorState", "Vaults", "GuardUntil", "StandingPoints", "TraitAlloys", "Perks"`

// clubRow reads a club row; forUpdate takes a row lock for a mutation.
func clubRow(ctx context.Context, q db.Querier, clubID string, forUpdate bool) (map[string]any, bool, error) {
	sql := `SELECT ` + clubColumns + ` FROM "Clubs" WHERE "_id" = $1`
	if forUpdate {
		sql += ` FOR UPDATE`
	}
	rows, err := q.Query(ctx, sql, clubID)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

// assetRows loads all ClubAssets rows keyed by AssetType.
func assetRows(ctx context.Context, q db.Querier, clubID string) (map[string]map[string]any, error) {
	rows, err := q.Query(ctx, `SELECT * FROM "ClubAssets" WHERE "ClubId" = $1`, clubID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := make(map[string]map[string]any, len(list))
	for _, row := range list {
		out[db.StringField(row, "AssetType")] = row
	}
	return out, nil
}

func levelOf(assets map[string]map[string]any, key string) int {
	if row := assets[key]; row != nil {
		return intOf(row["Level"])
	}
	return 0
}

func levelsMap(assets map[string]map[string]any) map[string]int {
	out := make(map[string]int, len(assets))
	for key, row := range assets {
		out[key] = intOf(row["Level"])
	}
	return out
}

// groundskeepers reads the club's Groundskeeper count, never below the
// milestone grant its Clubhouse tier has earned (04 §2).
func groundskeepers(ctx context.Context, q db.Querier, clubID string, tier int) (int, error) {
	row, ok, err := dbScanOne(ctx, q, `SELECT "Count" FROM "ClubGroundskeepers" WHERE "ClubId" = $1`, clubID)
	if err != nil {
		return 0, err
	}
	count := 0
	if ok {
		count = intOf(row["Count"])
	}
	if grant := GroundskeepersForTier(tier); count < grant {
		count = grant
	}
	if count > MaxGroundskeepers {
		count = MaxGroundskeepers
	}
	if count < 1 {
		count = 1
	}
	return count, nil
}

// activeUpgrades counts assets currently under construction.
func activeUpgrades(assets map[string]map[string]any) int {
	n := 0
	for _, row := range assets {
		if row["UpgradingTo"] != nil {
			n++
		}
	}
	return n
}

// SweepDueUpgrades promotes every due upgrade atomically and idempotently, then
// syncs Clubs.ClubhouseTier from the clubhouse asset. A double call promotes
// nothing the second time (the WHERE clears UpgradingTo), so it is safe under a
// crashed-and-retried tick. It returns the number of promotions and is shared by
// the campus read path and the world-worker builder ticker.
func SweepDueUpgrades(ctx context.Context, q db.Querier, now time.Time) (int64, error) {
	tag, err := q.Exec(ctx, `UPDATE "ClubAssets"
		SET "Level" = "UpgradingTo", "UpgradingTo" = NULL, "StartAt" = NULL, "CompleteAt" = NULL, "updatedAt" = now()
		WHERE "UpgradingTo" IS NOT NULL AND "CompleteAt" <= $1`, now)
	if err != nil {
		return 0, err
	}
	promoted := tag.RowsAffected()
	if promoted == 0 {
		// Nothing completed, so no Clubhouse tier can have moved: skip the sync
		// UPDATE (a round trip the campus read path runs on every request).
		return 0, nil
	}
	if _, err := q.Exec(ctx, `UPDATE "Clubs" c
		SET "ClubhouseTier" = ca."Level", "updatedAt" = now()
		FROM "ClubAssets" ca
		WHERE ca."ClubId" = c."_id" AND ca."AssetType" = 'clubhouse' AND ca."Level" > c."ClubhouseTier"`); err != nil {
		return promoted, err
	}
	return promoted, nil
}

// SweepDueUpgrades is the Repository form of the package-level function.
func (r *Repository) SweepDueUpgrades(ctx context.Context, now time.Time) (int64, error) {
	return SweepDueUpgrades(ctx, r.q, now)
}

// initCollectorState stamps any missing collector with `now` so accrual starts
// on the first read and then accumulates lazily (04 §3.1). Idempotent.
func initCollectorState(ctx context.Context, q db.Querier, clubID string, now time.Time) error {
	ts := db.ISO8601msUTC(now)
	_, err := q.Exec(ctx, `UPDATE "Clubs"
		SET "CollectorState" = coalesce("CollectorState", '{}'::jsonb)
			|| jsonb_build_object('turnstiles', to_jsonb($2::text), 'club_shop', to_jsonb($2::text)),
		    "updatedAt" = now()
		WHERE "_id" = $1
		  AND NOT (coalesce("CollectorState", '{}'::jsonb) ? 'turnstiles'
		           AND coalesce("CollectorState", '{}'::jsonb) ? 'club_shop')`, clubID, ts)
	return err
}

// BuildState assembles the campus read model. It first sweeps due upgrades so a
// read reflects completion (matching facilities.getCampus).
func (r *Repository) BuildState(ctx context.Context, clubID string, now time.Time, scale float64) (map[string]any, bool, error) {
	club, ok, err := clubRow(ctx, r.q, clubID, false)
	if err != nil || !ok {
		return nil, ok, err
	}
	promoted, err := r.SweepDueUpgrades(ctx, now)
	if err != nil {
		return nil, false, err
	}
	if promoted > 0 {
		// An upgrade completed (possibly this club's Clubhouse): re-read so the
		// read model reflects the new tier/levels.
		club, ok, err = clubRow(ctx, r.q, clubID, false)
		if err != nil || !ok {
			return nil, ok, err
		}
	}
	assets, err := assetRows(ctx, r.q, clubID)
	if err != nil {
		return nil, false, err
	}
	state := collectorState(club)
	if len(state) < len(Collectors) {
		if err := initCollectorState(ctx, r.q, clubID, now); err != nil {
			return nil, false, err
		}
		club, _, err = clubRow(ctx, r.q, clubID, false)
		if err != nil {
			return nil, false, err
		}
		state = collectorState(club)
	}
	keepers, err := groundskeepers(ctx, r.q, clubID, intOf(club["ClubhouseTier"]))
	if err != nil {
		return nil, false, err
	}
	if err := r.ensureObstacles(ctx, clubID); err != nil {
		return nil, false, err
	}
	obstacles, err := r.obstacles(ctx, clubID)
	if err != nil {
		return nil, false, err
	}
	return buildPayload(club, assets, state, keepers, obstacles, now, scale), true, nil
}

func (r *Repository) obstacles(ctx context.Context, clubID string) ([]map[string]any, error) {
	rows, err := r.q.Query(ctx, `SELECT "_id", "Kind", "X", "Z", "Rot" FROM "CampusObstacles"
		WHERE "ClubId" = $1 AND "ClearedAt" IS NULL ORDER BY "createdAt", "_id"`, clubID)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

// ensureObstacles lazily seeds a club's three Derelict Grounds obstacles the
// first time its campus is read (04 §2, "02 §A"). Migration 0045 backfilled the
// clubs that existed then; this covers every club founded afterwards without a
// creation-path dependency.
//
// It is safe for a returning club: an obstacle row is kept (ClearedAt) after it
// is cleared, so "no rows at all" is the only thing seeded - a club that cleared
// everything is never re-seeded. The seed takes the club row FOR UPDATE, so two
// concurrent first reads seed once. Kinds/positions are the deterministic hash
// 0045 uses, so a lazily seeded club matches a backfilled one.
func (r *Repository) ensureObstacles(ctx context.Context, clubID string) error {
	row, ok, err := dbScanOne(ctx, r.q,
		`SELECT count(*)::int AS n FROM "CampusObstacles" WHERE "ClubId" = $1`, clubID)
	if err != nil {
		return err
	}
	if ok && intOf(row["n"]) > 0 {
		return nil
	}
	return db.WithTx(ctx, r.q, func(tx db.Querier) error {
		club, ok, err := clubRow(ctx, tx, clubID, true)
		if err != nil || !ok || club == nil {
			return err
		}
		row, _, err := dbScanOne(ctx, tx,
			`SELECT count(*)::int AS n FROM "CampusObstacles" WHERE "ClubId" = $1`, clubID)
		if err != nil {
			return err
		}
		if row != nil && intOf(row["n"]) > 0 {
			return nil
		}
		_, err = tx.Exec(ctx, `INSERT INTO "CampusObstacles" ("ClubId","Kind","X","Z","Rot")
			SELECT $1::uuid,
			       (ARRAY['weeds', 'dirt', 'rubble'])[1 + (abs(hashtext($2::text || 'k' || g.n)) % 3)],
			       -12 + (abs(hashtext($2::text || 'x' || g.n)) % 20),
			       -10 + (abs(hashtext($2::text || 'z' || g.n)) % 18),
			       0
			FROM generate_series(1, 3) AS g(n)`, clubID, clubID)
		return err
	})
}

// debit subtracts amount from the club's currency balance with a guarded UPDATE,
// so a racing request cannot overdraw. intCurrency columns are integral.
func debit(ctx context.Context, q db.Querier, clubID string, cur Currency, amount float64) error {
	col, integral := balanceColumn(cur)
	if !integral {
		return fmt.Errorf("unknown currency %q", cur)
	}
	var arg any = int64(math.Round(amount))
	if cur == Cash {
		arg = amount
	}
	sql := fmt.Sprintf(`UPDATE "Clubs" SET %s = coalesce(%s, 0) - $2, "updatedAt" = now()
		WHERE "_id" = $1 AND coalesce(%s, 0) >= $2`, col, col, col)
	tag, err := q.Exec(ctx, sql, clubID, arg)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInsufficientFunds
	}
	return nil
}

func balanceColumn(cur Currency) (string, bool) {
	switch cur {
	case Cash:
		return `"Budget"`, true
	case Fans:
		return `"Fans"`, true
	case ScoutTokens:
		return `"ScoutTokens"`, true
	case SponsorCredits:
		return `"SponsorCredits"`, true
	default:
		return "", false
	}
}

// credit adds amount to the club's currency balance. intCurrency columns are
// integral, Cash is real.
func credit(ctx context.Context, q db.Querier, clubID string, cur Currency, amount float64) error {
	col, ok := balanceColumn(cur)
	if !ok {
		return fmt.Errorf("unknown currency %q", cur)
	}
	var arg any = int64(math.Round(amount))
	if cur == Cash {
		arg = amount
	}
	_, err := q.Exec(ctx, fmt.Sprintf(`UPDATE "Clubs" SET %s = coalesce(%s, 0) + $2, "updatedAt" = now()
		WHERE "_id" = $1`, col, col), clubID, arg)
	return err
}

func ledger(ctx context.Context, q db.Querier, clubID, typ string, amount float64, note string) error {
	_, err := q.Exec(ctx, `INSERT INTO "TransferLedger" ("Type", "BuyerClubId", "Amount", "Note", "updatedAt")
		VALUES ($1, $2, $3, $4, now())`, typ, clubID, amount, note)
	return err
}

// StartUpgrade pays for and queues the next level of a campus facility. The
// whole write is one transaction: debit (guarded), ClubAssets upsert with
// absolute UTC StartAt/CompleteAt, and a TransferLedger row.
func (r *Repository) StartUpgrade(ctx context.Context, clubID, key string, now time.Time, scale float64) error {
	def, ok := FacilityDefFor(key)
	if !ok {
		return ErrUnsupportedFacility
	}
	return db.WithTx(ctx, r.q, func(tx db.Querier) error {
		club, ok, err := clubRow(ctx, tx, clubID, true)
		if err != nil {
			return err
		}
		if !ok {
			return ErrClubNotFound
		}
		if _, err := SweepDueUpgrades(ctx, tx, now); err != nil {
			return err
		}
		club, ok, err = clubRow(ctx, tx, clubID, true)
		if err != nil || !ok {
			return ErrClubNotFound
		}
		tier := intOf(club["ClubhouseTier"])
		if tier < 1 {
			tier = 1
		}
		assets, err := assetRows(ctx, tx, clubID)
		if err != nil {
			return err
		}
		if row := assets[key]; row != nil && row["UpgradingTo"] != nil {
			return ErrAlreadyUpgrading
		}
		level := levelOf(assets, key)
		if level >= def.MaxLevel {
			return ErrMaxLevel
		}
		target := level + 1
		if key == "clubhouse" {
			if tier >= MaxClubhouseTier || target > MaxClubhouseTier {
				return ErrMaxLevel
			}
			if allowed, missing := CanUpgradeClubhouse(target, levelsMap(assets)); !allowed {
				return fmt.Errorf("%w: %s", ErrClubhouseRequirements, missingText(missing))
			}
		} else if target > tier {
			return fmt.Errorf("%w: needs Clubhouse level %d", ErrFacilityCapped, target)
		}
		keepers, err := groundskeepers(ctx, tx, clubID, tier)
		if err != nil {
			return err
		}
		if !CanStartUpgrade(activeUpgrades(assets), keepers) {
			return ErrAllBuildersBusy
		}
		cost := UpgradeCostFor(def, target)
		if err := debit(ctx, tx, clubID, def.Currency, cost); err != nil {
			return err
		}
		readyAt := now.Add(time.Duration(UpgradeMinutesFor(def, target, scale) * float64(time.Minute)))
		if _, err := tx.Exec(ctx, `INSERT INTO "ClubAssets" ("ClubId", "AssetType", "Level", "UpgradingTo", "StartAt", "CompleteAt", "updatedAt")
			VALUES ($1, $2, $3, $4, $5, $6, now())
			ON CONFLICT ("ClubId", "AssetType") DO UPDATE
			SET "UpgradingTo" = EXCLUDED."UpgradingTo", "StartAt" = EXCLUDED."StartAt",
			    "CompleteAt" = EXCLUDED."CompleteAt", "updatedAt" = now()`,
			clubID, key, level, target, now, readyAt); err != nil {
			return err
		}
		return ledger(ctx, tx, clubID, "facility", cost, fmt.Sprintf("%s -> level %d", def.Name, target))
	})
}

// Collect banks every collector's lazy accrual in one transaction, crediting the
// correct currency and writing one ledger row per non-empty currency. After the
// write lastCollectedAt = now, so a double collect yields nothing (idempotent).
func (r *Repository) Collect(ctx context.Context, clubID string, now time.Time, scale float64) (map[string]any, error) {
	var out map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		club, ok, err := clubRow(ctx, tx, clubID, true)
		if err != nil {
			return err
		}
		if !ok {
			return ErrClubNotFound
		}
		tier := intOf(club["ClubhouseTier"])
		if tier < 1 {
			tier = 1
		}
		assets, err := assetRows(ctx, tx, clubID)
		if err != nil {
			return err
		}
		state := collectorState(club)
		var cash, fans float64
		next := map[string]any{}
		for _, def := range Collectors {
			level := levelOf(assets, def.Key)
			since := parseTime(state[def.Key])
			if since.IsZero() {
				since = now
			}
			cap := CollectorCapacity(def, level, vaultLevel(club, assets, def), tier)
			pend := AccrueScaled(Collector{RatePerHour: CollectorRate(def, level), Capacity: cap}, since, now, scale)
			switch def.Currency {
			case Cash:
				cash += pend
			case Fans:
				fans += pend
			}
			next[def.Key] = db.ISO8601msUTC(now)
		}
		cash = math.Round(cash)
		fans = math.Round(fans)
		if cash <= 0 && fans <= 0 {
			return ErrNothingToCollect
		}
		if _, err := tx.Exec(ctx, `UPDATE "Clubs"
			SET "Budget" = coalesce("Budget", 0) + $2, "Fans" = coalesce("Fans", 0) + $3,
			    "CollectorState" = $4, "updatedAt" = now()
			WHERE "_id" = $1`, clubID, cash, int64(fans), next); err != nil {
			return err
		}
		if cash > 0 {
			if err := ledger(ctx, tx, clubID, "collector_income", cash, "Turnstiles"); err != nil {
				return err
			}
		}
		if fans > 0 {
			if err := ledger(ctx, tx, clubID, "collector_income", fans, "Club Shop"); err != nil {
				return err
			}
		}
		out = map[string]any{"cash": cash, "fans": fans}
		return nil
	})
	return out, err
}

// Place moves one campus building and saves the whole (validated) layout.
func (r *Repository) Place(ctx context.Context, clubID, building string, x, z, rot int, now time.Time) (bool, error) {
	if _, ok := facilities.CampusBuildings[building]; !ok {
		return false, ErrUnknownBuilding
	}
	if rot < 0 || rot > 3 {
		return false, ErrInvalidPlacement
	}
	var found bool
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		club, ok, err := clubRow(ctx, tx, clubID, true)
		if err != nil {
			return err
		}
		if !ok {
			return nil // not found: found stays false
		}
		found = true
		placement := placementOf(club["CampusPlacement"])
		placement[building] = facilities.Placed{X: x, Z: z, Rot: rot}
		if problem := facilities.ValidatePlacement(placement); problem != "" {
			return fmt.Errorf("%w: %s", ErrInvalidPlacement, problem)
		}
		_, err = tx.Exec(ctx, `UPDATE "Clubs" SET "CampusPlacement" = $2, "updatedAt" = now() WHERE "_id" = $1`,
			clubID, placementJSON(placement))
		return err
	})
	return found, err
}

// ClearObstacle clears one Derelict Grounds obstacle: debit the Cash cost, keep
// the row (ClearedAt) and pay the Fan bonus, all in one transaction.
func (r *Repository) ClearObstacle(ctx context.Context, clubID, obstacleID string, now time.Time) error {
	return db.WithTx(ctx, r.q, func(tx db.Querier) error {
		row, ok, err := dbScanOne(ctx, tx, `SELECT "_id", "Kind", "ClearedAt" FROM "CampusObstacles"
			WHERE "_id" = $1 AND "ClubId" = $2`, obstacleID, clubID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrObstacleNotFound
		}
		if row["ClearedAt"] != nil {
			return ErrObstacleAlreadyCleared
		}
		def, ok := ObstacleDefFor(db.StringField(row, "Kind"))
		if !ok {
			return ErrObstacleNotFound
		}
		if err := debit(ctx, tx, clubID, Cash, def.ClearCost); err != nil {
			return err
		}
		tag, err := tx.Exec(ctx, `UPDATE "CampusObstacles" SET "ClearedAt" = now(), "updatedAt" = now()
			WHERE "_id" = $1 AND "ClearedAt" IS NULL`, obstacleID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrObstacleAlreadyCleared
		}
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Fans" = coalesce("Fans", 0) + $2, "updatedAt" = now() WHERE "_id" = $1`,
			clubID, int64(math.Round(def.BonusFans))); err != nil {
			return err
		}
		if err := ledger(ctx, tx, clubID, "obstacle", def.ClearCost, "Cleared "+def.Kind); err != nil {
			return err
		}
		return ledger(ctx, tx, clubID, "obstacle", def.BonusFans, def.Kind+" bonus")
	})
}

// BuyGroundskeeper buys the next purchasable Groundskeeper with Sponsor Credits
// (04 §2). Groundskeepers 1-3 are milestones and #6 is the Club Legacy chain.
func (r *Repository) BuyGroundskeeper(ctx context.Context, clubID string, now time.Time) error {
	return db.WithTx(ctx, r.q, func(tx db.Querier) error {
		club, ok, err := clubRow(ctx, tx, clubID, true)
		if err != nil {
			return err
		}
		if !ok {
			return ErrClubNotFound
		}
		tier := intOf(club["ClubhouseTier"])
		if tier < 1 {
			tier = 1
		}
		count, err := groundskeepers(ctx, tx, clubID, tier)
		if err != nil {
			return err
		}
		next := count + 1
		if next > MaxGroundskeepers {
			return ErrGroundskeepersMaxed
		}
		price, ok := GroundskeeperPrice(next)
		if !ok {
			return fmt.Errorf("%w: Groundskeeper %d", ErrGroundskeeperEarned, next)
		}
		if err := debit(ctx, tx, clubID, SponsorCredits, price); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO "ClubGroundskeepers" ("ClubId", "Count", "updatedAt")
			VALUES ($1, $2, now())
			ON CONFLICT ("ClubId") DO UPDATE SET "Count" = $2, "updatedAt" = now()`, clubID, next); err != nil {
			return err
		}
		return ledger(ctx, tx, clubID, "groundskeeper", price, fmt.Sprintf("Groundskeeper %d", next))
	})
}

// UsePerk redeems one quick consumable Board Perk (04 §7, §10): it decrements
// the club's Clubs.Perks counter and applies the perk's effect, all in one
// transaction with a TransferLedger row. It is idempotent per perk instance: a
// supplied instanceId that was already redeemed returns the stored count
// without applying again (the PerkConsumptions (ClubId, InstanceId) guard).
// An unknown perk is refused, an empty counter is refused (409), and a
// Construction/Research perk needs a valid `target` (a running upgrade).
//
// The effect is applied only when the redemption is fresh, so a replayed
// instanceId is a no-op even if the target has since finished.
func (r *Repository) UsePerk(ctx context.Context, clubID, perkKey, instanceID, target string, now time.Time) (map[string]any, error) {
	def, ok := PerkDefFor(perkKey)
	if !ok {
		return nil, ErrUnknownPerk
	}
	// Pure target validation up front: a missing / out-of-scope target never
	// consumes the perk.
	if err := validatePerkTarget(def, target); err != nil {
		return nil, err
	}
	var out map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		club, ok, err := clubRow(ctx, tx, clubID, true)
		if err != nil {
			return err
		}
		if !ok {
			return ErrClubNotFound
		}
		// The once-only guard: a replayed instanceId inserted by an earlier
		// request conflicts (nothing applied twice). The guard is written in the
		// same transaction as the effect, so a rolled-back redemption can be
		// retried.
		already := false
		if instanceID != "" {
			tag, err := tx.Exec(ctx, `INSERT INTO "PerkConsumptions" ("InstanceId","ClubId","Perk","updatedAt")
				VALUES ($1,$2,$3,now()) ON CONFLICT ("ClubId","InstanceId") DO NOTHING`,
				instanceID, clubID, def.Key)
			if err != nil {
				return err
			}
			already = tag.RowsAffected() == 0
		}
		perks, _ := club["Perks"].(map[string]any)
		remaining := PerkCount(perks, def.Key)
		granted := 0.0
		applied := false
		if !already {
			if remaining <= 0 {
				return ErrPerkUnavailable
			}
			// Guarded, atomic decrement: the WHERE means a racing redemption can
			// never drive the counter below zero.
			tag, err := tx.Exec(ctx, `UPDATE "Clubs"
				SET "Perks" = jsonb_set(coalesce("Perks", '{}'::jsonb), ARRAY[$2],
				        to_jsonb(coalesce(("Perks"->>$2)::int, 0) - 1)),
				    "updatedAt" = now()
				WHERE "_id" = $1 AND coalesce(("Perks"->>$2)::int, 0) > 0`, clubID, def.Key)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				return ErrPerkUnavailable
			}
			// Per-kind effect, validated against real state. A resource perk
			// credits its currency; Construction/Research finish a faculty
			// upgrade; Combat/Cosmetic are recorded no-ops.
			if def.Kind == PerkResource {
				if err := credit(ctx, tx, clubID, def.Currency, def.Amount); err != nil {
					return err
				}
				granted = def.Amount
			} else if err := applyPerkEffect(ctx, tx, clubID, def, target, now); err != nil {
				return err
			}
			if err := ledger(ctx, tx, clubID, "perk_use", perkUseAmount(def), perkUseNote(def, target)); err != nil {
				return err
			}
			remaining--
			applied = true
		}
		out = map[string]any{
			"perk":      def.Key,
			"name":      def.Name,
			"kind":      string(def.Kind),
			"currency":  string(def.Currency),
			"target":    target,
			"granted":   granted,
			"remaining": remaining,
			"applied":   applied,
			"now":       db.ISO8601msUTC(now),
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// perkUseAmount is the ledger amount for a redemption: the currency amount for a
// Resource perk, otherwise one (a single consumable was spent).
func perkUseAmount(def PerkDef) float64 {
	if def.Kind == PerkResource {
		return def.Amount
	}
	return 1
}

// perkUseNote names the redemption (and its target when one applies).
func perkUseNote(def PerkDef, target string) string {
	if target == "" {
		return def.Name
	}
	return def.Name + " -> " + target
}

// ---------------------------------------------------------------------------
// Read-model helpers (pure given their inputs).
// ---------------------------------------------------------------------------

func buildPayload(club map[string]any, assets map[string]map[string]any, state map[string]string, keepers int, obstacles []map[string]any, now time.Time, scale float64) map[string]any {
	tier := intOf(club["ClubhouseTier"])
	if tier < 1 {
		tier = 1
	}
	active := activeUpgrades(assets)
	cash := floatOf(club["Budget"])

	collectors := make([]any, 0, len(Collectors))
	vaults := make([]any, 0, len(Collectors))
	for _, def := range Collectors {
		level := levelOf(assets, def.Key)
		vlevel := vaultLevel(club, assets, def)
		cap := CollectorCapacity(def, level, vlevel, tier)
		since := parseTime(state[def.Key])
		pend := 0.0
		if !since.IsZero() {
			pend = AccrueScaled(Collector{RatePerHour: CollectorRate(def, level), Capacity: cap}, since, now, scale)
		}
		full := cap > 0 && pend >= cap
		collectors = append(collectors, map[string]any{
			"key":               def.Key,
			"name":              def.Name,
			"currency":          string(def.Currency),
			"productionPerHour": CollectorRate(def, level),
			"capacity":          cap,
			"pending":           round1(pend),
			"collectedAt":       collectorCollectedAt(state, def.Key, now),
			"full":              full,
			"secondsToFull":     secondsToFull(Collector{RatePerHour: CollectorRate(def, level), Capacity: cap}, pend),
		})
		balance := cash
		switch def.Currency {
		case Fans:
			balance = float64(intOf(club["Fans"]))
		case ScoutTokens:
			balance = float64(intOf(club["ScoutTokens"]))
		case SponsorCredits:
			balance = float64(intOf(club["SponsorCredits"]))
		}
		vaults = append(vaults, map[string]any{
			"currency": string(def.Currency),
			"level":    vlevel,
			"capacity": VaultCapacityForTier(CollectorRate(def, maxInt(level, 1))*CollectorStorageHours, 2, maxInt(vlevel, 1), tier),
			"balance":  balance,
		})
	}

	next := keepers + 1
	var nextCost any
	var nextCurrency any
	earnedBy := "max"
	switch {
	case next > MaxGroundskeepers:
		earnedBy = "max"
	case next <= MilestoneGroundskeepers:
		earnedBy = "milestone"
	case next == 6:
		earnedBy = "legacy"
	default:
		if price, ok := GroundskeeperPrice(next); ok {
			earnedBy = "purchase"
			nextCost = price
			nextCurrency = string(SponsorCredits)
		}
	}

	assetList := make([]any, 0, len(facilityOrder))
	for _, key := range facilityOrder {
		def := Facilities[key]
		level := levelOf(assets, key)
		row := assets[key]
		var upgrade any
		if row != nil && row["UpgradingTo"] != nil {
			readyAt := db.StringField(row, "CompleteAt")
			startAt := db.StringField(row, "StartAt")
			upgrade = map[string]any{
				"toLevel":     intOf(row["UpgradingTo"]),
				"startAt":     startAt,
				"readyAt":     readyAt,
				"secondsLeft": secondsLeft(readyAt, now),
			}
		}
		var nextInfo any
		if level < def.MaxLevel {
			target := level + 1
			blocked := blockedReason(key, target, def, level, active, keepers, tier, assets)
			var blockedAny any
			if blocked != "" {
				blockedAny = blocked
			}
			nextInfo = map[string]any{
				"level":         target,
				"cost":          UpgradeCostFor(def, target),
				"minutes":       UpgradeMinutesFor(def, target, 1),
				"blockedReason": blockedAny,
			}
		}
		assetList = append(assetList, map[string]any{
			"type":     key,
			"name":     def.Name,
			"level":    level,
			"maxLevel": def.MaxLevel,
			"currency": string(def.Currency),
			"upgrade":  upgrade,
			"next":     nextInfo,
		})
	}

	obstacleList := make([]any, 0, len(obstacles))
	for _, o := range obstacles {
		kind := db.StringField(o, "Kind")
		def, _ := ObstacleDefFor(kind)
		obstacleList = append(obstacleList, map[string]any{
			"id":         db.StringField(o, "_id"),
			"kind":       kind,
			"x":          intOf(o["X"]),
			"z":          intOf(o["Z"]),
			"rot":        intOf(o["Rot"]),
			"clearCost":  def.ClearCost,
			"clearBonus": def.BonusFans,
		})
	}

	var guardUntil any
	if v := db.StringField(club, "GuardUntil"); v != "" {
		guardUntil = v
	}

	return map[string]any{
		"clubId":         db.StringField(club, "_id"),
		"name":           db.StringField(club, "Name"),
		"code":           db.StringField(club, "ClubCode"),
		"cash":           cash,
		"fans":           intOf(club["Fans"]),
		"scoutTokens":    intOf(club["ScoutTokens"]),
		"sponsorCredits": intOf(club["SponsorCredits"]),
		"standingPoints": intOf(club["StandingPoints"]),
		"guardUntil":     guardUntil,
		"clubhouse": map[string]any{
			"tier":        tier,
			"maxTier":     MaxClubhouseTier,
			"upgradingTo": clubhouseUpgradingTo(assets),
			"readyAt":     clubhouseReadyAt(assets),
			"missing":     missingList(targetTier(tier), levelsMap(assets)),
		},
		"collectors": collectors,
		"vaults":     vaults,
		"groundskeepers": map[string]any{
			"count":        keepers,
			"max":          MaxGroundskeepers,
			"active":       active,
			"nextCost":     nextCost,
			"nextCurrency": nextCurrency,
			"nextEarnedBy": earnedBy,
		},
		"obstacles": obstacleList,
		"perks":     perkList(club),
		"assets":    assetList,
		"now":       db.ISO8601msUTC(now),
	}
}

func targetTier(tier int) int {
	if tier >= MaxClubhouseTier {
		return 0
	}
	return tier + 1
}

func blockedReason(key string, target int, def FacilityDef, level, active, keepers, tier int, assets map[string]map[string]any) string {
	if row := assets[key]; row != nil && row["UpgradingTo"] != nil {
		return "Already upgrading"
	}
	if active >= keepers {
		return "All groundskeepers are busy"
	}
	if key == "clubhouse" {
		if target > MaxClubhouseTier {
			return "Maximum Clubhouse tier reached"
		}
		if ok, missing := CanUpgradeClubhouse(target, levelsMap(assets)); !ok {
			return "Requires " + missingText(missing)
		}
		return ""
	}
	if target > tier {
		return fmt.Sprintf("Requires Clubhouse level %d", target)
	}
	return ""
}

func missingText(missing []Requirement) string {
	if len(missing) == 0 {
		return "nothing"
	}
	sort.Slice(missing, func(i, j int) bool { return missing[i].Facility < missing[j].Facility })
	parts := make([]string, 0, len(missing))
	for _, r := range missing {
		parts = append(parts, fmt.Sprintf("%s level %d", r.Facility, r.Level))
	}
	return joinComma(parts)
}

func missingList(target int, levels map[string]int) []any {
	out := []any{}
	if target == 0 {
		return out
	}
	for _, r := range MissingRequirements(target, levels) {
		out = append(out, map[string]any{"facility": r.Facility, "level": r.Level})
	}
	return out
}

func clubhouseUpgradingTo(assets map[string]map[string]any) any {
	if row := assets["clubhouse"]; row != nil && row["UpgradingTo"] != nil {
		return intOf(row["UpgradingTo"])
	}
	return nil
}

func clubhouseReadyAt(assets map[string]map[string]any) any {
	if row := assets["clubhouse"]; row != nil && row["UpgradingTo"] != nil {
		if s := db.StringField(row, "CompleteAt"); s != "" {
			return s
		}
	}
	return nil
}

func collectorState(club map[string]any) map[string]string {
	out := map[string]string{}
	raw, _ := club["CollectorState"].(map[string]any)
	for k, v := range raw {
		if s, ok := v.(string); ok {
			out[k] = s
		}
	}
	return out
}

// perkList is the deterministic Board-Perks inventory for the campus read
// (04 §7, §10): every registry perk with its current counter. Only registry
// perks are listed; an unknown stored key is ignored.
func perkList(club map[string]any) []any {
	perks, _ := club["Perks"].(map[string]any)
	out := make([]any, 0, len(perkOrder))
	for _, key := range perkOrder {
		def := Perks[key]
		out = append(out, map[string]any{
			"key":   def.Key,
			"name":  def.Name,
			"count": PerkCount(perks, key),
		})
	}
	return out
}

func vaultLevel(club map[string]any, assets map[string]map[string]any, def CollectorDef) int {
	if lvl := levelOf(assets, def.VaultKey); lvl > 0 {
		return lvl
	}
	raw, _ := club["Vaults"].(map[string]any)
	return intOf(raw[string(def.Currency)])
}

func collectorCollectedAt(state map[string]string, key string, now time.Time) string {
	if v := state[key]; v != "" {
		return v
	}
	return db.ISO8601msUTC(now)
}

func secondsToFull(c Collector, pending float64) int {
	if c.Capacity <= 0 || c.RatePerHour <= 0 || pending >= c.Capacity {
		return 0
	}
	return int(math.Ceil((c.Capacity - pending) / c.RatePerHour * 3600))
}

func secondsLeft(readyAt string, now time.Time) int {
	t := parseTime(readyAt)
	if t.IsZero() {
		return 0
	}
	left := t.Sub(now).Seconds()
	if left < 0 {
		return 0
	}
	return int(math.Ceil(left))
}

func parseTime(s string) time.Time {
	if s == "" {
		return time.Time{}
	}
	t, err := time.Parse("2006-01-02T15:04:05.000Z", s)
	if err != nil {
		return time.Time{}
	}
	return t
}

func placementOf(stored any) map[string]facilities.Placed {
	out := map[string]facilities.Placed{}
	for k, v := range facilities.DefaultPlacement {
		out[k] = v
	}
	raw, _ := stored.(map[string]any)
	for k, v := range raw {
		m, ok := v.(map[string]any)
		if !ok {
			continue
		}
		out[k] = facilities.Placed{X: intOf(m["x"]), Z: intOf(m["z"]), Rot: intOf(m["rot"])}
	}
	return out
}

func placementJSON(p map[string]facilities.Placed) map[string]any {
	out := make(map[string]any, len(p))
	for k, v := range p {
		out[k] = map[string]any{"x": v.X, "z": v.Z, "rot": v.Rot}
	}
	return out
}

func dbScanOne(ctx context.Context, q db.Querier, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }

func joinComma(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += ", "
		}
		out += p
	}
	return out
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func intOf(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int32:
		return int(n)
	case int64:
		return int(n)
	case float64:
		return int(n)
	case float32:
		return int(n)
	default:
		return 0
	}
}

func floatOf(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int32:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return 0
	}
}
