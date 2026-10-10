package seasonpass

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"time"

	"fs-pro-server/internal/campus"
	"fs-pro-server/internal/db"
)

// This file wires the pure season core (seasonpass.go, calendar.go, content.go)
// to Postgres: the monthly catalogue, objective claims, the Silver/Gold pass
// claims, the Season Bank (accrued exactly once per source) and the Board Perk
// inventory. Reads use the column-keyed map passthrough; every mutation runs in
// a transaction with a ledger row and a uniqueness guard so a retry can never
// double-apply (matches internal/campus, internal/abilities).

// Sentinel errors the handlers map to HTTP statuses. Named after the condition.
var (
	ErrClubNotFound        = errors.New("club not found")
	ErrObjectiveNotFound   = errors.New("unknown season objective")
	ErrObjectiveIncomplete = errors.New("objective is not complete")
	ErrUnknownTrack        = errors.New("unknown season track")
	ErrPassRequired        = errors.New("the Gold track needs the Season Pass")
	ErrAlreadyClaimed      = errors.New("that reward has already been claimed")
	ErrNothingToClaim      = errors.New("nothing is claimable")
	ErrSeasonNotEnded      = errors.New("the season has not ended")
	ErrInsufficientCredits = errors.New("insufficient Sponsor Credits")
	ErrInsufficientPerks   = errors.New("not enough Board Perks")
)

// Repository is the pgx-backed season store.
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// Q exposes the querier (access checks / ad-hoc reads).
func (r *Repository) Q() db.Querier { return r.q }

// The track values stored in SeasonClaims. Objective rows use Track="objective"
// (Tier = the objective's 1-based catalogue ordinal); Silver/Gold reward rows use
// the track name; the paid-pass entitlement is a single "pass"/tier-0 row.
const (
	trackObjective = "objective"
	trackPass      = "pass"
)

// ---------------------------------------------------------------------------
// Internal helpers.
// ---------------------------------------------------------------------------

func one(ctx context.Context, q db.Querier, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
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

// ledger writes one append-only economy row (every currency/perk mutation goes
// through here; never a bare UPDATE, AGENTS.md).
func ledger(ctx context.Context, q db.Querier, clubID, typ string, amount float64, note string) error {
	_, err := q.Exec(ctx, `INSERT INTO "TransferLedger" ("Type","BuyerClubId","Amount","Note","updatedAt")
		VALUES ($1,$2,$3,$4,now())`, typ, clubID, amount, note)
	return err
}

func clubExists(ctx context.Context, q db.Querier, clubID string) (bool, error) {
	_, ok, err := one(ctx, q, `SELECT "_id" FROM "Clubs" WHERE "_id" = $1`, clubID)
	return ok, err
}

// lockClub takes the club row lock (serializing every season mutation for a
// club, which makes the exactly-once source guard in AccrueFromLoot reliable).
func lockClub(ctx context.Context, q db.Querier, clubID string) (bool, error) {
	_, ok, err := one(ctx, q, `SELECT "_id" FROM "Clubs" WHERE "_id" = $1 FOR UPDATE`, clubID)
	return ok, err
}

// ---------------------------------------------------------------------------
// Catalogue seeding.
// ---------------------------------------------------------------------------

// EnsureCatalog upserts the season's objective + tier catalogue (idempotent).
func (r *Repository) EnsureCatalog(ctx context.Context, seasonKey string) error {
	return r.ensureCatalog(ctx, r.q, seasonKey)
}

func (r *Repository) ensureCatalog(ctx context.Context, q db.Querier, seasonKey string) error {
	if _, err := ParseSeasonKey(seasonKey); err != nil {
		return err
	}
	for _, o := range Objectives {
		if _, err := q.Exec(ctx, `INSERT INTO "SeasonObjectives" ("SeasonKey","Code","Title","Points","Goal","updatedAt")
			VALUES ($1,$2,$3,$4,$5,now())
			ON CONFLICT ("SeasonKey","Code") DO UPDATE
			SET "Title" = EXCLUDED."Title", "Points" = EXCLUDED."Points", "Goal" = EXCLUDED."Goal", "updatedAt" = now()`,
			seasonKey, o.Code, o.Title, o.Points, o.Goal); err != nil {
			return err
		}
	}
	for tier := 1; tier <= MaxTier(); tier++ {
		rewards, err := tierRewardsJSON(tier)
		if err != nil {
			return err
		}
		if _, err := q.Exec(ctx, `INSERT INTO "SeasonTiers" ("SeasonKey","Tier","Points","Rewards","updatedAt")
			VALUES ($1,$2,$3,$4::jsonb,now())
			ON CONFLICT ("SeasonKey","Tier") DO UPDATE
			SET "Points" = EXCLUDED."Points", "Rewards" = EXCLUDED."Rewards", "updatedAt" = now()`,
			seasonKey, tier, TierThresholds[tier-1], rewards); err != nil {
			return err
		}
	}
	return nil
}

func rewardJSON(r Reward) map[string]any {
	out := map[string]any{}
	if r.Cash != 0 {
		out["cash"] = r.Cash
	}
	if r.Fans != 0 {
		out["fans"] = r.Fans
	}
	if r.ScoutTokens != 0 {
		out["scoutTokens"] = r.ScoutTokens
	}
	if r.SponsorCredits != 0 {
		out["sponsorCredits"] = r.SponsorCredits
	}
	if len(r.Perks) > 0 {
		perks := map[string]any{}
		for _, id := range sortedKeys(r.Perks) {
			perks[id] = r.Perks[id]
		}
		out["perks"] = perks
	}
	return out
}

func tierRewardsJSON(tier int) (string, error) {
	payload := map[string]any{
		string(Silver): rewardJSON(SilverReward(tier)),
		string(Gold):   rewardJSON(GoldReward(tier)),
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

// ---------------------------------------------------------------------------
// Reads.
// ---------------------------------------------------------------------------

func seasonPoints(ctx context.Context, q db.Querier, clubID, seasonKey string) (int, error) {
	row, ok, err := one(ctx, q, `SELECT coalesce(sum("Points"),0)::int AS p FROM "SeasonClaims"
		WHERE "ClubId" = $1 AND "SeasonKey" = $2 AND "Track" = 'objective'`, clubID, seasonKey)
	if err != nil {
		return 0, err
	}
	if !ok {
		return 0, nil
	}
	return intOf(row["p"]), nil
}

func claimedTier(ctx context.Context, q db.Querier, clubID, seasonKey string, track Track) (int, error) {
	row, ok, err := one(ctx, q, `SELECT coalesce(max("Tier"),0)::int AS t FROM "SeasonClaims"
		WHERE "ClubId" = $1 AND "SeasonKey" = $2 AND "Track" = $3`, clubID, seasonKey, string(track))
	if err != nil {
		return 0, err
	}
	if !ok {
		return 0, nil
	}
	return intOf(row["t"]), nil
}

func hasSeasonPass(ctx context.Context, q db.Querier, clubID, seasonKey string) (bool, error) {
	_, ok, err := one(ctx, q, `SELECT "_id" FROM "SeasonClaims"
		WHERE "ClubId" = $1 AND "SeasonKey" = $2 AND "Track" = 'pass' AND "Tier" = 0`, clubID, seasonKey)
	return ok, err
}

func objectiveClaimed(ctx context.Context, q db.Querier, clubID, seasonKey string, ordinal int) (bool, error) {
	_, ok, err := one(ctx, q, `SELECT "_id" FROM "SeasonClaims"
		WHERE "ClubId" = $1 AND "SeasonKey" = $2 AND "Track" = 'objective' AND "Tier" = $3`, clubID, seasonKey, ordinal)
	return ok, err
}

func bankRow(ctx context.Context, q db.Querier, clubID, seasonKey string) (accrued, claimed float64, ok bool, err error) {
	row, found, err := one(ctx, q, `SELECT "Accrued","Claimed" FROM "SeasonBank" WHERE "ClubId" = $1 AND "SeasonKey" = $2`, clubID, seasonKey)
	if err != nil || !found {
		return 0, 0, false, err
	}
	return floatOf(row["Accrued"]), floatOf(row["Claimed"]), true, nil
}

// BuildSeason assembles the season read model (05 §3 season.get): points, tier,
// tracks, the objective catalogue with server-evaluated progress, the tier
// rewards and the Season Bank.
func (r *Repository) BuildSeason(ctx context.Context, clubID, seasonKey string, now time.Time) (map[string]any, bool, error) {
	club, ok, err := one(ctx, r.q, `SELECT "_id","Name","ClubhouseTier" FROM "Clubs" WHERE "_id" = $1`, clubID)
	if err != nil || !ok {
		return nil, ok, err
	}
	if err := r.ensureCatalog(ctx, r.q, seasonKey); err != nil {
		return nil, false, err
	}
	points, err := seasonPoints(ctx, r.q, clubID, seasonKey)
	if err != nil {
		return nil, false, err
	}
	silverClaimed, err := claimedTier(ctx, r.q, clubID, seasonKey, Silver)
	if err != nil {
		return nil, false, err
	}
	goldClaimed, err := claimedTier(ctx, r.q, clubID, seasonKey, Gold)
	if err != nil {
		return nil, false, err
	}
	hasPass, err := hasSeasonPass(ctx, r.q, clubID, seasonKey)
	if err != nil {
		return nil, false, err
	}
	tier := TierForPoints(points)

	objectives, err := r.objectivePayload(ctx, r.q, clubID, seasonKey, now)
	if err != nil {
		return nil, false, err
	}
	perks, err := r.ListPerks(ctx, clubID)
	if err != nil {
		return nil, false, err
	}

	endsAt, _ := SeasonEnd(seasonKey)
	accrued, claimed, _, err := bankRow(ctx, r.q, clubID, seasonKey)
	if err != nil {
		return nil, false, err
	}
	claimable := BankClaimable(int(math.Round(accrued)), int(math.Round(claimed)))

	return map[string]any{
		"clubId":            clubID,
		"name":              db.StringField(club, "Name"),
		"seasonKey":         seasonKey,
		"points":            points,
		"tier":              tier,
		"maxTier":           MaxTier(),
		"nextThreshold":     NextThreshold(points),
		"hasPass":           hasPass,
		"silverClaimedTier": silverClaimed,
		"goldClaimedTier":   goldClaimed,
		"endsAt":            db.ISO8601msUTC(endsAt),
		"objectives":        objectives,
		"tiers":             r.tierPayload(silverClaimed, goldClaimed, hasPass, tier),
		"bank": map[string]any{
			"seasonKey": seasonKey,
			"accrued":   math.Round(accrued*100) / 100,
			"claimed":   math.Round(claimed*100) / 100,
			"claimable": float64(claimable),
			"open":      BankClaimOpen(seasonKey, now),
			"endsAt":    db.ISO8601msUTC(endsAt),
		},
		"perks": perks,
		"now":   db.ISO8601msUTC(now),
	}, true, nil
}

func (r *Repository) objectivePayload(ctx context.Context, q db.Querier, clubID, seasonKey string, now time.Time) ([]any, error) {
	out := make([]any, 0, len(Objectives))
	_ = now
	for i, o := range Objectives {
		ordinal := i + 1
		progress, err := evaluateMetric(ctx, q, clubID, o.Metric, seasonKey)
		if err != nil {
			return nil, err
		}
		claimed, err := objectiveClaimed(ctx, q, clubID, seasonKey, ordinal)
		if err != nil {
			return nil, err
		}
		complete := progress >= o.Goal
		out = append(out, map[string]any{
			"id":       o.Code,
			"code":     o.Code,
			"ordinal":  ordinal,
			"title":    o.Title,
			"points":   o.Points,
			"goal":     o.Goal,
			"progress": progress,
			"complete": complete,
			"claimed":  claimed,
			"scope":    string(o.Scope),
			"metric":   string(o.Metric),
		})
	}
	return out, nil
}

func (r *Repository) tierPayload(silverClaimed, goldClaimed int, hasPass bool, reached int) []any {
	out := make([]any, 0, MaxTier())
	for i, need := range TierThresholds {
		tier := i + 1
		out = append(out, map[string]any{
			"tier":            tier,
			"points":          need,
			"silver":          rewardJSON(SilverReward(tier)),
			"gold":            rewardJSON(GoldReward(tier)),
			"silverClaimed":   tier <= silverClaimed,
			"goldClaimed":     tier <= goldClaimed,
			"silverClaimable": tier > silverClaimed && reached >= tier,
			"goldClaimable":   tier > goldClaimed && reached >= tier && hasPass,
		})
	}
	return out
}

// evaluateMetric computes an objective's server-side progress. Completion is
// never taken from the client (05 §6): every value is a bounded aggregate query.
func evaluateMetric(ctx context.Context, q db.Querier, clubID string, metric Metric, seasonKey string) (int, error) {
	start, err := SeasonStart(seasonKey)
	if err != nil {
		return 0, err
	}
	var (
		row map[string]any
		ok  bool
	)
	switch metric {
	case MetricClubhouseTier:
		row, ok, err = one(ctx, q, `SELECT coalesce("ClubhouseTier",1)::int AS v FROM "Clubs" WHERE "_id" = $1`, clubID)
	case MetricGroundskeepers:
		if row, ok, err = one(ctx, q, `SELECT coalesce("ClubhouseTier",1)::int AS tier,
			coalesce((SELECT "Count" FROM "ClubGroundskeepers" WHERE "ClubId" = $1), 0)::int AS v
			FROM "Clubs" WHERE "_id" = $1`, clubID); err == nil && ok {
			count := intOf(row["v"])
			if grant := campus.GroundskeepersForTier(intOf(row["tier"])); count < grant {
				count = grant
			}
			return count, nil
		}
	case MetricRaidWins:
		row, ok, err = one(ctx, q, `SELECT count(*)::int AS v FROM "RaidResults"
			WHERE "AttackerClubId" = $1 AND "ResolvedAt" >= $2 AND NOT "Practice" AND "AttackerGoals" > "DefenderGoals"`, clubID, start)
	case MetricRaidStars:
		row, ok, err = one(ctx, q, `SELECT coalesce(sum("Stars"),0)::int AS v FROM "RaidResults"
			WHERE "AttackerClubId" = $1 AND "ResolvedAt" >= $2 AND NOT "Practice"`, clubID, start)
	case MetricHonours:
		row, ok, err = one(ctx, q, `SELECT count(*)::int AS v FROM "Honours"
			WHERE "ClubId" = $1 AND "CompletedAt" IS NOT NULL AND "CompletedAt" >= $2`, clubID, start)
	case MetricAssociationStars:
		row, ok, err = one(ctx, q, `SELECT coalesce(max(s."Stars"),0)::int AS v
			FROM "AssociationLeagueStandings" s
			JOIN "AssociationMembers" m ON m."AssociationId" = s."AssociationId"
			WHERE m."ClubId" = $1 AND s."SeasonKey" = $2`, clubID, seasonKey)
	default:
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	if !ok {
		return 0, nil
	}
	return intOf(row["v"]), nil
}

// ---------------------------------------------------------------------------
// Claims.
// ---------------------------------------------------------------------------

// ClaimObjective records a completed objective and its points, idempotently.
// The metric is evaluated server-side; an incomplete objective is refused
// (ErrObjectiveIncomplete). A second claim of the same objective is a no-op
// success (unique (club, season, track, ordinal)) so points cannot double.
func (r *Repository) ClaimObjective(ctx context.Context, clubID, seasonKey, objectiveID string, now time.Time) (map[string]any, error) {
	obj, ok := ObjectiveFor(objectiveID)
	if !ok {
		return nil, ErrObjectiveNotFound
	}
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if found, err := lockClub(ctx, tx, clubID); err != nil {
			return err
		} else if !found {
			return ErrClubNotFound
		}
		if err := r.ensureCatalog(ctx, tx, seasonKey); err != nil {
			return err
		}
		progress, err := evaluateMetric(ctx, tx, clubID, obj.Metric, seasonKey)
		if err != nil {
			return err
		}
		if progress < obj.Goal {
			return fmt.Errorf("%w: %s %d/%d", ErrObjectiveIncomplete, obj.Code, progress, obj.Goal)
		}
		ordinal := ObjectiveOrdinal(obj.Code)
		if _, err := tx.Exec(ctx, `INSERT INTO "SeasonClaims" ("ClubId","SeasonKey","Track","Tier","Points","updatedAt")
			VALUES ($1,$2,'objective',$3,$4,now())
			ON CONFLICT ("ClubId","SeasonKey","Track","Tier") DO NOTHING`,
			clubID, seasonKey, ordinal, obj.Points); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	payload, _, err := r.BuildSeason(ctx, clubID, seasonKey, now)
	return payload, err
}

// ClaimPass claims the next reward tier on a track. It routes the decision
// through the audited CanClaim gate: an unknown track is never claimable, and
// the Gold track needs the paid Season Pass. The claim row's unique key makes a
// repeat a 409 (ErrAlreadyClaimed) rather than a double reward.
func (r *Repository) ClaimPass(ctx context.Context, clubID, seasonKey string, track Track, now time.Time) (map[string]any, error) {
	if track != Silver && track != Gold {
		return nil, ErrUnknownTrack
	}
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if found, err := lockClub(ctx, tx, clubID); err != nil {
			return err
		} else if !found {
			return ErrClubNotFound
		}
		if err := r.ensureCatalog(ctx, tx, seasonKey); err != nil {
			return err
		}
		points, err := seasonPoints(ctx, tx, clubID, seasonKey)
		if err != nil {
			return err
		}
		claimed, err := claimedTier(ctx, tx, clubID, seasonKey, track)
		if err != nil {
			return err
		}
		hasPass, err := hasSeasonPass(ctx, tx, clubID, seasonKey)
		if err != nil {
			return err
		}
		tier := TierForPoints(points)
		if !CanClaim(track, hasPass, tier, claimed) {
			if track == Gold && !hasPass {
				return ErrPassRequired
			}
			return ErrNothingToClaim
		}
		next := claimed + 1
		reward, _ := TierReward(track, next)
		tag, err := tx.Exec(ctx, `INSERT INTO "SeasonClaims" ("ClubId","SeasonKey","Track","Tier","Points","updatedAt")
			VALUES ($1,$2,$3,$4,$5,now())
			ON CONFLICT ("ClubId","SeasonKey","Track","Tier") DO NOTHING`,
			clubID, seasonKey, string(track), next, points)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrAlreadyClaimed
		}
		return grantReward(ctx, tx, clubID, reward, fmt.Sprintf("%s tier %d", track, next))
	})
	if err != nil {
		return nil, err
	}
	payload, _, err := r.BuildSeason(ctx, clubID, seasonKey, now)
	return payload, err
}

// ClaimBank credits the accrued Season Bank at season end (ErrSeasonNotEnded
// guards the gate). The credited amount is exactly BankClaimable; Claimed is
// advanced so a second claim yields nothing (idempotent).
func (r *Repository) ClaimBank(ctx context.Context, clubID, seasonKey string, now time.Time) (map[string]any, error) {
	if !BankClaimOpen(seasonKey, now) {
		return nil, ErrSeasonNotEnded
	}
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if found, err := lockClub(ctx, tx, clubID); err != nil {
			return err
		} else if !found {
			return ErrClubNotFound
		}
		accrued, claimed, _, err := bankRow(ctx, tx, clubID, seasonKey)
		if err != nil {
			return err
		}
		claimable := BankClaimable(int(math.Round(accrued)), int(math.Round(claimed)))
		if claimable <= 0 {
			return ErrNothingToClaim
		}
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Budget" = coalesce("Budget",0) + $2, "updatedAt" = now()
			WHERE "_id" = $1`, clubID, float64(claimable)); err != nil {
			return err
		}
		if err := ledger(ctx, tx, clubID, "season_bank", float64(claimable), "Season bank claim "+seasonKey); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE "SeasonBank" SET "Claimed" = "Claimed" + $3, "updatedAt" = now()
			WHERE "ClubId" = $1 AND "SeasonKey" = $2`, clubID, seasonKey, float64(claimable)); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	payload, _, err := r.BuildSeason(ctx, clubID, seasonKey, now)
	return payload, err
}

// ---------------------------------------------------------------------------
// Season Bank accrual (exactly once per source).
// ---------------------------------------------------------------------------

// BankShareBp is the Season Bank share of raid/Derby loot, in basis points
// (20%). Content - tunable.
const BankShareBp = 2000

// AccrueFromLoot banks BankAccrual(income, BankShareBp) against a source. It is
// exactly-once per source: the club row is locked (serializing accruals) and a
// guard ledger row keyed by the source note is inserted with a NOT EXISTS, so a
// crash-and-retry (or a duplicate call) adds nothing the second time. Returns
// the amount banked (0 when the source was already applied or the share rounds
// to zero).
func (r *Repository) AccrueFromLoot(ctx context.Context, clubID, seasonKey, sourceKey string, income int) (int, error) {
	share := BankAccrual(income, BankShareBp)
	if share <= 0 {
		return 0, nil
	}
	var banked int
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if found, err := lockClub(ctx, tx, clubID); err != nil {
			return err
		} else if !found {
			return ErrClubNotFound
		}
		note := "bank_accrual:" + seasonKey + ":" + sourceKey
		tag, err := tx.Exec(ctx, `INSERT INTO "TransferLedger" ("Type","BuyerClubId","Amount","Note","updatedAt")
			SELECT 'season_bank', $1, $2, $3, now()
			WHERE NOT EXISTS (
				SELECT 1 FROM "TransferLedger"
				WHERE "Type" = 'season_bank' AND "BuyerClubId" = $1 AND "Note" = $3
			)`, clubID, float64(share), note)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return nil // already banked for this source
		}
		if _, err := tx.Exec(ctx, `INSERT INTO "SeasonBank" ("ClubId","SeasonKey","Accrued","updatedAt")
			VALUES ($1,$2,$3,now())
			ON CONFLICT ("ClubId","SeasonKey") DO UPDATE
			SET "Accrued" = "SeasonBank"."Accrued" + EXCLUDED."Accrued", "updatedAt" = now()`,
			clubID, seasonKey, float64(share)); err != nil {
			return err
		}
		banked = share
		return nil
	})
	return banked, err
}

// AccrueRaidLoot is the raid-path convenience: it banks a share of a resolved
// raid's loot, keyed by the raid id (the source). The raid's own RaidResults PK
// already makes resolution once-only; this adds the source guard on top.
func (r *Repository) AccrueRaidLoot(ctx context.Context, clubID string, now time.Time, raidID string, lootTotal int) (int, error) {
	return r.AccrueFromLoot(ctx, clubID, SeasonKeyFor(now), "raid:"+raidID, lootTotal)
}

// ---------------------------------------------------------------------------
// Board Perks (04 §7) and the premium seam.
// ---------------------------------------------------------------------------

// PerkEntry is one BoardPerks row.
type PerkEntry struct {
	Perk  string
	Count int
}

// ListPerks reads a club's Board Perk inventory, merged with the catalogue.
func (r *Repository) ListPerks(ctx context.Context, clubID string) ([]any, error) {
	rows, err := r.q.Query(ctx, `SELECT "Perk","Count" FROM "BoardPerks" WHERE "ClubId" = $1 ORDER BY "Perk"`, clubID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	owned := make(map[string]int, len(list))
	for _, m := range list {
		owned[db.StringField(m, "Perk")] = intOf(m["Count"])
	}
	out := make([]any, 0, len(Perks))
	for _, p := range Perks {
		out = append(out, map[string]any{
			"perk":     p.ID,
			"name":     p.Name,
			"category": p.Category,
			"count":    owned[p.ID],
		})
	}
	return out, nil
}

// GrantPerk adds `count` copies of a Board Perk to the club (upsert, additive,
// ledgered). Board Perks are never stealable - there is no path that removes
// them except SpendPerk.
func (r *Repository) GrantPerk(ctx context.Context, clubID, perk string, count int) error {
	if _, ok := PerkDefFor(perk); !ok {
		return fmt.Errorf("unknown board perk %q", perk)
	}
	if count <= 0 {
		return fmt.Errorf("perk count must be positive")
	}
	return db.WithTx(ctx, r.q, func(tx db.Querier) error {
		return grantPerk(ctx, tx, clubID, perk, count)
	})
}

func grantPerk(ctx context.Context, q db.Querier, clubID, perk string, count int) error {
	if _, err := q.Exec(ctx, `INSERT INTO "BoardPerks" ("ClubId","Perk","Count","updatedAt")
		VALUES ($1,$2,$3,now())
		ON CONFLICT ("ClubId","Perk") DO UPDATE
		SET "Count" = "BoardPerks"."Count" + EXCLUDED."Count", "updatedAt" = now()`,
		clubID, perk, count); err != nil {
		return err
	}
	return ledger(ctx, q, clubID, "perk_grant", float64(count), "Board Perk "+perk)
}

// SpendPerk consumes `count` copies of a Board Perk (guarded so a racing spend
// cannot go negative).
func (r *Repository) SpendPerk(ctx context.Context, clubID, perk string, count int) error {
	if _, ok := PerkDefFor(perk); !ok {
		return fmt.Errorf("unknown board perk %q", perk)
	}
	if count <= 0 {
		return fmt.Errorf("perk count must be positive")
	}
	return db.WithTx(ctx, r.q, func(tx db.Querier) error {
		tag, err := tx.Exec(ctx, `UPDATE "BoardPerks" SET "Count" = "Count" - $3, "updatedAt" = now()
			WHERE "ClubId" = $1 AND "Perk" = $2 AND "Count" >= $3`, clubID, perk, count)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrInsufficientPerks
		}
		return nil
	})
}

// SpendSponsorCredits is the premium seam (04 §9): it debits Sponsor Credits
// with a guarded UPDATE and writes a ledger row. There is intentionally no
// payment-provider integration in this scope - callers decide what a spend
// buys; the balance write is the only side effect.
func (r *Repository) SpendSponsorCredits(ctx context.Context, clubID string, credits int, note string) error {
	if credits < 0 {
		return fmt.Errorf("credit amount must not be negative")
	}
	if credits == 0 {
		return nil
	}
	return db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if found, err := lockClub(ctx, tx, clubID); err != nil {
			return err
		} else if !found {
			return ErrClubNotFound
		}
		return spendSponsorCredits(ctx, tx, clubID, credits, note)
	})
}

func spendSponsorCredits(ctx context.Context, q db.Querier, clubID string, credits int, note string) error {
	tag, err := q.Exec(ctx, `UPDATE "Clubs" SET "SponsorCredits" = coalesce("SponsorCredits",0) - $2, "updatedAt" = now()
		WHERE "_id" = $1 AND coalesce("SponsorCredits",0) >= $2`, clubID, credits)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInsufficientCredits
	}
	return ledger(ctx, q, clubID, "premium", float64(credits), note)
}

// BuySeasonPass grants the Gold Season Pass for the season, spending Sponsor
// Credits through the seam. It is idempotent: owning the pass already is a
// no-op, so a retry can never double-charge.
func (r *Repository) BuySeasonPass(ctx context.Context, clubID, seasonKey string) error {
	return db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if found, err := lockClub(ctx, tx, clubID); err != nil {
			return err
		} else if !found {
			return ErrClubNotFound
		}
		owned, err := hasSeasonPass(ctx, tx, clubID, seasonKey)
		if err != nil {
			return err
		}
		if owned {
			return nil
		}
		if err := spendSponsorCredits(ctx, tx, clubID, PassPriceCredits, "Season Pass "+seasonKey); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO "SeasonClaims" ("ClubId","SeasonKey","Track","Tier","Points","updatedAt")
			VALUES ($1,$2,'pass',0,0,now())
			ON CONFLICT ("ClubId","SeasonKey","Track","Tier") DO NOTHING`, clubID, seasonKey)
		return err
	})
}

// HasPass reports whether the club owns the Gold Season Pass for the season.
func (r *Repository) HasPass(ctx context.Context, clubID, seasonKey string) (bool, error) {
	return hasSeasonPass(ctx, r.q, clubID, seasonKey)
}

// ---------------------------------------------------------------------------
// Reward granting.
// ---------------------------------------------------------------------------

func grantReward(ctx context.Context, q db.Querier, clubID string, reward Reward, note string) error {
	if reward.IsZero() {
		return nil
	}
	if reward.Cash != 0 || reward.Fans != 0 || reward.ScoutTokens != 0 || reward.SponsorCredits != 0 {
		if _, err := q.Exec(ctx, `UPDATE "Clubs"
			SET "Budget" = coalesce("Budget",0) + $2,
			    "Fans" = coalesce("Fans",0) + $3,
			    "ScoutTokens" = coalesce("ScoutTokens",0) + $4,
			    "SponsorCredits" = coalesce("SponsorCredits",0) + $5,
			    "updatedAt" = now()
			WHERE "_id" = $1`,
			clubID, reward.Cash, reward.Fans, reward.ScoutTokens, reward.SponsorCredits); err != nil {
			return err
		}
		if reward.Cash != 0 {
			if err := ledger(ctx, q, clubID, "season_reward", reward.Cash, note+" cash"); err != nil {
				return err
			}
		}
		if reward.Fans != 0 {
			if err := ledger(ctx, q, clubID, "season_reward", float64(reward.Fans), note+" fans"); err != nil {
				return err
			}
		}
		if reward.ScoutTokens != 0 {
			if err := ledger(ctx, q, clubID, "season_reward", float64(reward.ScoutTokens), note+" tokens"); err != nil {
				return err
			}
		}
		if reward.SponsorCredits != 0 {
			if err := ledger(ctx, q, clubID, "season_reward", float64(reward.SponsorCredits), note+" credits"); err != nil {
				return err
			}
		}
	}
	for _, perk := range sortedKeys(reward.Perks) {
		if err := grantPerk(ctx, q, clubID, perk, reward.Perks[perk]); err != nil {
			return err
		}
	}
	return nil
}

func sortedKeys(m map[string]int) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
