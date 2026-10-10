package campus

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

var campusClubSeq int64

// newTestClub inserts a club inside the caller's (rolled-back) transaction and
// returns its id. Only Name/ClubCode/updatedAt are required; everything else
// uses its DB default, overridden per test.
func newTestClub(t *testing.T, ctx context.Context, q db.Querier, overrides map[string]any) string {
	t.Helper()
	code := fmt.Sprintf("CT%d", atomic.AddInt64(&campusClubSeq, 1))
	data := map[string]any{
		"Name":      "Campus Test " + code,
		"ClubCode":  code,
		"updatedAt": time.Now(),
	}
	for k, v := range overrides {
		data[k] = v
	}
	row, err := db.InsertRow(ctx, q, "Clubs", data)
	if err != nil {
		t.Fatalf("insert test club: %v", err)
	}
	return db.StringField(row, "_id")
}

func mustClubRow(t *testing.T, ctx context.Context, q db.Querier, clubID string) map[string]any {
	t.Helper()
	row, ok, err := clubRow(ctx, q, clubID, false)
	if err != nil || !ok {
		t.Fatalf("clubRow: ok=%v err=%v", ok, err)
	}
	return row
}

func mustAssets(t *testing.T, ctx context.Context, q db.Querier, clubID string) map[string]map[string]any {
	t.Helper()
	rows, err := assetRows(ctx, q, clubID)
	if err != nil {
		t.Fatalf("assetRows: %v", err)
	}
	return rows
}

func ledgerCount(t *testing.T, ctx context.Context, q db.Querier, clubID, typ string) int {
	t.Helper()
	row, ok, err := dbScanOne(ctx, q, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "BuyerClubId" = $1 AND "Type" = $2`, clubID, typ)
	if err != nil || !ok {
		t.Fatalf("ledger count: ok=%v err=%v", ok, err)
	}
	return intOf(row["n"])
}

func TestCampusRepositoryRolledBack(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := db.New(ctx, url, 15*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)

		// --- Upgrade debits the crossed currency (04 §1.1) -----------------
		clubID := newTestClub(t, ctx, tx, map[string]any{
			"Budget": 1_000_000.0, "Fans": 1_000_000, "ClubhouseTier": 3,
		})
		before := mustClubRow(t, ctx, tx, clubID)
		if err := repo.StartUpgrade(ctx, clubID, "turnstiles", now, 1); err != nil {
			return fmt.Errorf("start turnstiles: %w", err)
		}
		after := mustClubRow(t, ctx, tx, clubID)
		if intOf(after["Fans"]) != intOf(before["Fans"])-40000 {
			return fmt.Errorf("turnstiles must cost 40000 Fans: %v -> %v", before["Fans"], after["Fans"])
		}
		if after["Budget"] != before["Budget"] {
			return fmt.Errorf("turnstiles must not touch Cash: %v -> %v", before["Budget"], after["Budget"])
		}
		assets := mustAssets(t, ctx, tx, clubID)
		if assets["turnstiles"] == nil || intOf(assets["turnstiles"]["UpgradingTo"]) != 1 {
			return fmt.Errorf("turnstiles not queued: %+v", assets["turnstiles"])
		}
		if ledgerCount(t, ctx, tx, clubID, "facility") != 1 {
			return fmt.Errorf("upgrade must write one facility ledger row")
		}

		// A second facility is refused at 1 Groundskeeper.
		busyClub := newTestClub(t, ctx, tx, map[string]any{
			"Budget": 1_000_000.0, "Fans": 1_000_000, "ClubhouseTier": 1,
		})
		if err := repo.StartUpgrade(ctx, busyClub, "club_shop", now, 1); err != nil {
			return fmt.Errorf("first upgrade should start: %w", err)
		}
		if err := repo.StartUpgrade(ctx, busyClub, "fan_vault", now, 1); !errors.Is(err, ErrAllBuildersBusy) {
			return fmt.Errorf("second upgrade err = %v, want ErrAllBuildersBusy", err)
		}

		// Insufficient funds never starts an upgrade.
		poorClub := newTestClub(t, ctx, tx, map[string]any{"Fans": 0, "ClubhouseTier": 1})
		if err := repo.StartUpgrade(ctx, poorClub, "turnstiles", now, 1); !errors.Is(err, ErrInsufficientFunds) {
			return fmt.Errorf("poor upgrade err = %v, want ErrInsufficientFunds", err)
		}
		if err := repo.StartUpgrade(ctx, poorClub, "nope", now, 1); !errors.Is(err, ErrUnsupportedFacility) {
			return fmt.Errorf("unknown facility err = %v, want ErrUnsupportedFacility", err)
		}

		// --- Promotion is atomic and idempotent under a double tick ---------
		doneClub := newTestClub(t, ctx, tx, map[string]any{"ClubhouseTier": 1})
		if _, err := tx.Exec(ctx, `INSERT INTO "ClubAssets" ("ClubId","AssetType","Level","UpgradingTo","StartAt","CompleteAt","updatedAt")
			VALUES ($1,'turnstiles',1,2,$2,$2,now())`, doneClub, now.Add(-time.Minute)); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO "ClubAssets" ("ClubId","AssetType","Level","UpgradingTo","StartAt","CompleteAt","updatedAt")
			VALUES ($1,'clubhouse',1,2,$2,$2,now())`, doneClub, now.Add(-time.Minute)); err != nil {
			return err
		}
		promoted, err := SweepDueUpgrades(ctx, tx, now)
		if err != nil {
			return err
		}
		if promoted != 2 {
			return fmt.Errorf("first sweep promoted %d, want 2", promoted)
		}
		promoted2, err := SweepDueUpgrades(ctx, tx, now)
		if err != nil || promoted2 != 0 {
			return fmt.Errorf("second sweep promoted %d (err %v), want 0", promoted2, err)
		}
		doneAssets := mustAssets(t, ctx, tx, doneClub)
		if intOf(doneAssets["turnstiles"]["Level"]) != 2 || doneAssets["turnstiles"]["UpgradingTo"] != nil {
			return fmt.Errorf("turnstiles not promoted: %+v", doneAssets["turnstiles"])
		}
		if intOf(mustClubRow(t, ctx, tx, doneClub)["ClubhouseTier"]) != 2 {
			return fmt.Errorf("clubhouse tier not synced from the promoted asset")
		}

		// --- Collect is lazy and idempotent ---------------------------------
		collectClub := newTestClub(t, ctx, tx, map[string]any{"Budget": 0.0, "Fans": 0})
		if _, err := tx.Exec(ctx, `INSERT INTO "ClubAssets" ("ClubId","AssetType","Level","updatedAt") VALUES ($1,'turnstiles',2,now())`, collectClub); err != nil {
			return err
		}
		since := db.ISO8601msUTC(now.Add(-3 * time.Hour))
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "CollectorState" = jsonb_build_object('turnstiles', to_jsonb($2::text), 'club_shop', to_jsonb($2::text)) WHERE "_id" = $1`, collectClub, since); err != nil {
			return err
		}
		collected, err := repo.Collect(ctx, collectClub, now, 1)
		if err != nil {
			return fmt.Errorf("collect: %w", err)
		}
		// Turnstiles level 2 => 1200/hr * 3h = 3600 Cash.
		if v, _ := collected["cash"].(float64); v != 3600 {
			return fmt.Errorf("collected cash = %v, want 3600", collected["cash"])
		}
		if intOf(mustClubRow(t, ctx, tx, collectClub)["Budget"]) != 3600 {
			return fmt.Errorf("cash not credited")
		}
		if ledgerCount(t, ctx, tx, collectClub, "collector_income") != 1 {
			return fmt.Errorf("collect must write one ledger row")
		}
		if _, err := repo.Collect(ctx, collectClub, now, 1); !errors.Is(err, ErrNothingToCollect) {
			return fmt.Errorf("second collect err = %v, want ErrNothingToCollect", err)
		}

		// --- Place validates the whole layout -------------------------------
		placeClub := newTestClub(t, ctx, tx, nil)
		if _, err := repo.Place(ctx, placeClub, "dugout", 6, -3, 0, now); err != nil {
			return fmt.Errorf("valid place: %w", err)
		}
		if _, err := repo.Place(ctx, placeClub, "nope", 0, 0, 0, now); !errors.Is(err, ErrUnknownBuilding) {
			return fmt.Errorf("unknown building err = %v", err)
		}
		if _, err := repo.Place(ctx, placeClub, "stands", 6, -3, 0, now); !errors.Is(err, ErrInvalidPlacement) {
			return fmt.Errorf("overlap err = %v, want ErrInvalidPlacement", err)
		}

		// --- Obstacles: debit, bonus, once-only -----------------------------
		obsClub := newTestClub(t, ctx, tx, map[string]any{"Budget": 100000.0, "Fans": 0})
		obs, err := db.InsertRow(ctx, tx, "CampusObstacles", map[string]any{
			"ClubId": obsClub, "Kind": "weeds", "X": 1, "Z": 1, "Rot": 0, "updatedAt": time.Now(),
		})
		if err != nil {
			return err
		}
		obsID := db.StringField(obs, "_id")
		if err := repo.ClearObstacle(ctx, obsClub, obsID, now); err != nil {
			return fmt.Errorf("clear obstacle: %w", err)
		}
		obsAfter := mustClubRow(t, ctx, tx, obsClub)
		if intOf(obsAfter["Budget"]) != 99500 || intOf(obsAfter["Fans"]) != 50 {
			return fmt.Errorf("obstacle economy wrong: %+v", obsAfter)
		}
		if ledgerCount(t, ctx, tx, obsClub, "obstacle") != 2 {
			return fmt.Errorf("clear must write cost + bonus ledger rows")
		}
		if err := repo.ClearObstacle(ctx, obsClub, obsID, now); !errors.Is(err, ErrObstacleAlreadyCleared) {
			return fmt.Errorf("second clear err = %v, want ErrObstacleAlreadyCleared", err)
		}

		// --- Groundskeepers: milestones vs purchase vs legacy ---------------
		gkClub := newTestClub(t, ctx, tx, map[string]any{"SponsorCredits": 2000, "ClubhouseTier": 3})
		// tier 3 => effective count 3; next (4) is purchasable.
		if err := repo.BuyGroundskeeper(ctx, gkClub, now); err != nil {
			return fmt.Errorf("buy #4: %w", err)
		}
		if intOf(mustClubRow(t, ctx, tx, gkClub)["SponsorCredits"]) != 1500 {
			return fmt.Errorf("buy #4 must cost 500 Sponsor Credits")
		}
		if err := repo.BuyGroundskeeper(ctx, gkClub, now); err != nil {
			return fmt.Errorf("buy #5: %w", err)
		}
		if err := repo.BuyGroundskeeper(ctx, gkClub, now); !errors.Is(err, ErrGroundskeeperEarned) {
			return fmt.Errorf("buy #6 err = %v, want ErrGroundskeeperEarned", err)
		}
		if _, err := tx.Exec(ctx, `UPDATE "ClubGroundskeepers" SET "Count" = 6 WHERE "ClubId" = $1`, gkClub); err != nil {
			return err
		}
		if err := repo.BuyGroundskeeper(ctx, gkClub, now); !errors.Is(err, ErrGroundskeepersMaxed) {
			return fmt.Errorf("buy past max err = %v, want ErrGroundskeepersMaxed", err)
		}
		milestoneClub := newTestClub(t, ctx, tx, map[string]any{"SponsorCredits": 2000, "ClubhouseTier": 1})
		if err := repo.BuyGroundskeeper(ctx, milestoneClub, now); !errors.Is(err, ErrGroundskeeperEarned) {
			return fmt.Errorf("buy #2 err = %v, want ErrGroundskeeperEarned (milestone)", err)
		}

		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back campus: %v", err)
	}
}

func TestBuildStateRolledBack(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := db.New(ctx, url, 15*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)
		clubID := newTestClub(t, ctx, tx, map[string]any{"Budget": 1000.0, "Fans": 200, "ClubhouseTier": 2})
		state, ok, err := repo.BuildState(ctx, clubID, now, 1)
		if err != nil || !ok {
			return fmt.Errorf("BuildState ok=%v err=%v", ok, err)
		}
		if intOf(state["fans"]) != 200 {
			return fmt.Errorf("fans = %v", state["fans"])
		}
		if ch, _ := state["clubhouse"].(map[string]any); intOf(ch["tier"]) != 2 {
			return fmt.Errorf("clubhouse tier = %v", state["clubhouse"])
		}
		collectors, _ := state["collectors"].([]any)
		if len(collectors) != len(Collectors) {
			return fmt.Errorf("collectors = %d, want %d", len(collectors), len(Collectors))
		}
		if _, ok, err := repo.BuildState(ctx, "00000000-0000-0000-0000-000000000000", now, 1); err != nil || ok {
			return fmt.Errorf("missing club: ok=%v err=%v", ok, err)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back build state: %v", err)
	}
}
