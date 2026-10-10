package legacy

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"fs-pro-server/internal/campus"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/seasonpass"
)

var legacyClubSeq int64

func newTestClub(t *testing.T, ctx context.Context, q db.Querier, overrides map[string]any) string {
	t.Helper()
	code := fmt.Sprintf("LG%d", atomic.AddInt64(&legacyClubSeq, 1))
	data := map[string]any{"Name": "Legacy Test " + code, "ClubCode": code, "updatedAt": time.Now()}
	for k, v := range overrides {
		data[k] = v
	}
	row, err := db.InsertRow(ctx, q, "Clubs", data)
	if err != nil {
		t.Fatalf("insert club: %v", err)
	}
	return db.StringField(row, "_id")
}

func countRows(t *testing.T, ctx context.Context, q db.Querier, sql string, args ...any) int {
	t.Helper()
	row, ok, err := one(ctx, q, sql, args...)
	if err != nil || !ok {
		t.Fatalf("count: ok=%v err=%v", ok, err)
	}
	return intOf(row["n"])
}

func ledgerCount(t *testing.T, ctx context.Context, q db.Querier, clubID, typ string) int {
	t.Helper()
	return countRows(t, ctx, q, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "BuyerClubId"=$1 AND "Type"=$2`, clubID, typ)
}

func TestLegacyRepositoryRolledBack(t *testing.T) {
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

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)
		club := newTestClub(t, ctx, tx, map[string]any{"ClubhouseTier": 3, "SponsorCredits": 0})

		// --- Incomplete chain is refused -----------------------------------
		for _, s := range Chain[:len(Chain)-1] {
			if err := repo.RecordStep(ctx, club, s.ID, s.Stars); err != nil {
				return fmt.Errorf("record %s: %w", s.ID, err)
			}
		}
		if _, err := repo.ClaimLegacy(ctx, club); !errors.Is(err, ErrChainIncomplete) {
			return fmt.Errorf("incomplete claim err = %v, want ErrChainIncomplete", err)
		}
		if err := repo.RecordStep(ctx, club, "nope", 1); !errors.Is(err, ErrUnknownStep) {
			return fmt.Errorf("unknown step err = %v, want ErrUnknownStep", err)
		}

		// --- Completing the chain grants the 6th Groundskeeper once --------
		last := Chain[len(Chain)-1]
		if err := repo.RecordStep(ctx, club, last.ID, last.Stars); err != nil {
			return err
		}
		payload, err := repo.ClaimLegacy(ctx, club)
		if err != nil {
			return fmt.Errorf("claim legacy: %w", err)
		}
		if b, _ := payload["complete"].(bool); !b {
			return fmt.Errorf("chain should be complete")
		}
		if intOf(payload["granted"]) != 1 {
			return fmt.Errorf("granted = %v, want 1", payload["granted"])
		}
		gs, _ := payload["groundskeepers"].(map[string]any)
		if intOf(gs["count"]) != campus.MaxGroundskeepers {
			return fmt.Errorf("groundskeeper count = %v, want %d", gs["count"], campus.MaxGroundskeepers)
		}
		if n := ledgerCount(t, ctx, tx, club, "groundskeeper"); n != 1 {
			return fmt.Errorf("groundskeeper ledger rows = %d, want 1", n)
		}
		// Idempotent: a second claim grants nothing and writes no ledger row.
		if _, err := repo.ClaimLegacy(ctx, club); err != nil {
			return fmt.Errorf("idempotent claim: %w", err)
		}
		if n := ledgerCount(t, ctx, tx, club, "groundskeeper"); n != 1 {
			return fmt.Errorf("idempotent claim wrote a ledger row (%d)", n)
		}
		if n := countRows(t, ctx, tx, `SELECT "Count"::int AS n FROM "ClubGroundskeepers" WHERE "ClubId"=$1`, club); n != campus.MaxGroundskeepers {
			return fmt.Errorf("ClubGroundskeepers.Count = %d, want %d", n, campus.MaxGroundskeepers)
		}

		// --- RecordStep is monotonic ---------------------------------------
		if err := repo.RecordStep(ctx, club, firstStep(t).ID, 0); err != nil {
			return fmt.Errorf("monotonic record: %w", err)
		}
		up, _, err := repo.BuildLegacy(ctx, club)
		if err != nil {
			return err
		}
		for _, s := range up["chain"].([]any) {
			m := s.(map[string]any)
			if db.StringField(m, "id") == firstStep(t).ID && intOf(m["progress"]) != firstStep(t).Stars {
				return fmt.Errorf("RecordStep lowered progress: %v", m["progress"])
			}
		}

		// --- Honours: claim once, grant reward once ------------------------
		if _, err := repo.ClaimHonour(ctx, club, "first-blood"); !errors.Is(err, ErrHonourIncomplete) {
			return fmt.Errorf("incomplete honour err = %v, want ErrHonourIncomplete", err)
		}
		if err := repo.RecordHonour(ctx, club, "first-blood", 1); err != nil {
			return fmt.Errorf("record honour: %w", err)
		}
		if _, err := repo.ClaimHonour(ctx, club, "first-blood"); err != nil {
			return fmt.Errorf("claim honour: %w", err)
		}
		if got := intOf(clubSponsor(ctx, t, tx, club)); got != 10 {
			return fmt.Errorf("SponsorCredits after honour = %d, want 10", got)
		}
		if _, err := repo.ClaimHonour(ctx, club, "first-blood"); err != nil {
			return fmt.Errorf("idempotent honour claim: %w", err)
		}
		if got := intOf(clubSponsor(ctx, t, tx, club)); got != 10 {
			return fmt.Errorf("idempotent honour doubled credits: %d", got)
		}
		if n := ledgerCount(t, ctx, tx, club, "season_reward"); n != 1 {
			return fmt.Errorf("honour reward ledger rows = %d, want 1", n)
		}
		if _, err := repo.ClaimHonour(ctx, club, "nope"); !errors.Is(err, ErrUnknownHonour) {
			return fmt.Errorf("unknown honour err = %v, want ErrUnknownHonour", err)
		}

		// --- Honours read model + missing club -----------------------------
		_, ok, err := repo.BuildHonours(ctx, club)
		if err != nil || !ok {
			return fmt.Errorf("BuildHonours ok=%v err=%v", ok, err)
		}
		if _, ok, err := repo.BuildLegacy(ctx, "00000000-0000-0000-0000-000000000000"); err != nil || ok {
			return fmt.Errorf("missing club: ok=%v err=%v", ok, err)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back legacy: %v", err)
	}
}

func firstStep(t *testing.T) Step {
	t.Helper()
	if len(Chain) == 0 {
		t.Fatal("empty chain")
	}
	return Chain[0]
}

func clubSponsor(ctx context.Context, t *testing.T, q db.Querier, clubID string) any {
	t.Helper()
	row, ok, err := one(ctx, q, `SELECT "SponsorCredits" FROM "Clubs" WHERE "_id"=$1`, clubID)
	if err != nil || !ok {
		t.Fatalf("read sponsor credits: ok=%v err=%v", ok, err)
	}
	return row["SponsorCredits"]
}

// TestLegacyImportsSeasonPerks pins the cross-package contract: legacy grants
// only perk ids declared in the seasonpass catalogue.
func TestLegacyImportsSeasonPerks(t *testing.T) {
	if _, ok := seasonpass.PerkDefFor(seasonpass.PerkRegalia); !ok {
		t.Fatal("seasonpass must declare the regalia perk legacy grants")
	}
}

// TestHonourPerkGrantRolledBack proves a perk-bearing Honour populates the
// Clubs.Perks inventory exactly once and the claim is idempotent.
func TestHonourPerkGrantRolledBack(t *testing.T) {
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

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)
		club := newTestClub(t, ctx, tx, map[string]any{"ClubhouseTier": 3, "SponsorCredits": 0})

		// home-fortress: Goal 10, reward Perks{regalia:1}.
		if err := repo.RecordHonour(ctx, club, "home-fortress", 10); err != nil {
			return fmt.Errorf("record home-fortress: %w", err)
		}
		if _, err := repo.ClaimHonour(ctx, club, "home-fortress"); err != nil {
			return fmt.Errorf("claim home-fortress: %w", err)
		}
		if got := clubPerk(t, ctx, tx, club, seasonpass.PerkRegalia); got != 1 {
			return fmt.Errorf("regalia after claim = %d, want 1", got)
		}
		if _, err := repo.ClaimHonour(ctx, club, "home-fortress"); err != nil {
			return fmt.Errorf("idempotent claim: %w", err)
		}
		if got := clubPerk(t, ctx, tx, club, seasonpass.PerkRegalia); got != 1 {
			return fmt.Errorf("an idempotent claim doubled regalia: %d", got)
		}

		// star-collector: Goal 50, reward Perks{instant_finish:1}.
		if err := repo.RecordHonour(ctx, club, "star-collector", 50); err != nil {
			return fmt.Errorf("record star-collector: %w", err)
		}
		if _, err := repo.ClaimHonour(ctx, club, "star-collector"); err != nil {
			return fmt.Errorf("claim star-collector: %w", err)
		}
		if got := clubPerk(t, ctx, tx, club, seasonpass.PerkInstantFinish); got != 1 {
			return fmt.Errorf("instant_finish after claim = %d, want 1", got)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back honour perk grant: %v", err)
	}
}

// clubPerk reads a perk's remaining count from a club's Clubs.Perks inventory.
func clubPerk(t *testing.T, ctx context.Context, q db.Querier, clubID, perk string) int {
	t.Helper()
	row, ok, err := one(ctx, q, `SELECT "Perks" FROM "Clubs" WHERE "_id"=$1`, clubID)
	if err != nil || !ok {
		t.Fatalf("read Clubs.Perks: ok=%v err=%v", ok, err)
	}
	perks, _ := row["Perks"].(map[string]any)
	return campus.PerkCount(perks, perk)
}
