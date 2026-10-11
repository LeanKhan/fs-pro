package seasonpass

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
)

var seasonClubSeq int64

func newTestClub(t *testing.T, ctx context.Context, q db.Querier, overrides map[string]any) string {
	t.Helper()
	code := fmt.Sprintf("SP%d", atomic.AddInt64(&seasonClubSeq, 1))
	data := map[string]any{"Name": "Season Test " + code, "ClubCode": code, "updatedAt": time.Now()}
	for k, v := range overrides {
		data[k] = v
	}
	row, err := db.InsertRow(ctx, q, "Clubs", data)
	if err != nil {
		t.Fatalf("insert club: %v", err)
	}
	return db.StringField(row, "_id")
}

func clubField(t *testing.T, ctx context.Context, q db.Querier, clubID string, field string) any {
	t.Helper()
	row, ok, err := one(ctx, q, `SELECT `+`"`+field+`"`+` AS v FROM "Clubs" WHERE "_id" = $1`, clubID)
	if err != nil || !ok {
		t.Fatalf("club field %s: ok=%v err=%v", field, ok, err)
	}
	return row["v"]
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
	return countRows(t, ctx, q, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "BuyerClubId" = $1 AND "Type" = $2`, clubID, typ)
}

// insertRaidWin inserts a resolved ranked raid (win, `stars` stars) for the
// attacker, which the raidWins/raidStars objective metrics read.
func insertRaidWin(t *testing.T, ctx context.Context, q db.Querier, attacker, defender string, stars int, at time.Time) string {
	t.Helper()
	row, err := db.InsertRow(ctx, q, "Raids", map[string]any{
		"AttackerClubId": attacker, "DefenderClubId": defender,
		"Seed": "seed", "updatedAt": time.Now(),
	})
	if err != nil {
		t.Fatalf("insert raid: %v", err)
	}
	raidID := db.StringField(row, "_id")
	if _, err := q.Exec(ctx, `INSERT INTO "RaidResults"
		("RaidId","AttackerClubId","DefenderClubId","Practice","Stars","AttackerGoals","DefenderGoals","Dominance","ResolvedAt")
		VALUES ($1,$2,$3,false,$4,3,1,0.7,$5)`, raidID, attacker, defender, stars, at); err != nil {
		t.Fatalf("insert raid result: %v", err)
	}
	return raidID
}

func TestSeasonRepositoryRolledBack(t *testing.T) {
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

	const seasonKey = "2026-09"
	inSeason := time.Date(2026, 9, 15, 12, 0, 0, 0, time.UTC)
	afterSeason := time.Date(2026, 10, 2, 9, 0, 0, 0, time.UTC)

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)

		// =====================================================================
		// Full month simulated end-to-end (P8 exit criterion).
		// =====================================================================
		club := newTestClub(t, ctx, tx, map[string]any{"Budget": 0.0, "SponsorCredits": 1000, "ClubhouseTier": 2})
		defender := newTestClub(t, ctx, tx, nil)

		// --- Premium seam: buy the Gold pass, idempotently ------------------
		if err := repo.BuySeasonPass(ctx, club, seasonKey); err != nil {
			return fmt.Errorf("buy pass: %w", err)
		}
		if err := repo.BuySeasonPass(ctx, club, seasonKey); err != nil {
			return fmt.Errorf("idempotent buy pass: %w", err)
		}
		if got := intOf(clubField(t, ctx, tx, club, "SponsorCredits")); got != 1000-PassPriceCredits {
			return fmt.Errorf("SponsorCredits = %d, want %d (charged once)", got, 1000-PassPriceCredits)
		}
		if ok, _ := repo.HasPass(ctx, club, seasonKey); !ok {
			return fmt.Errorf("pass must be owned after purchase")
		}
		if n := ledgerCount(t, ctx, tx, club, "premium"); n != 1 {
			return fmt.Errorf("premium ledger rows = %d, want 1", n)
		}

		// --- Objective claim idempotency -----------------------------------
		payload, err := repo.ClaimObjective(ctx, club, seasonKey, "clubhouse-tier-2", inSeason)
		if err != nil {
			return fmt.Errorf("claim clubhouse-tier-2: %w", err)
		}
		if got := intOf(payload["points"]); got != 300 {
			return fmt.Errorf("points after first claim = %d, want 300", got)
		}
		payload, err = repo.ClaimObjective(ctx, club, seasonKey, "clubhouse-tier-2", inSeason)
		if err != nil {
			return fmt.Errorf("idempotent re-claim: %w", err)
		}
		if got := intOf(payload["points"]); got != 300 {
			return fmt.Errorf("re-claim must not double points, got %d", got)
		}
		if n := countRows(t, ctx, tx, `SELECT count(*)::int AS n FROM "SeasonClaims" WHERE "ClubId"=$1 AND "SeasonKey"=$2 AND "Track"='objective' AND "Tier"=$3`, club, seasonKey, ObjectiveOrdinal("clubhouse-tier-2")); n != 1 {
			return fmt.Errorf("objective claim rows = %d, want 1", n)
		}
		// An incomplete objective is refused; an unknown one is not found.
		if _, err := repo.ClaimObjective(ctx, club, seasonKey, "clubhouse-tier-3", inSeason); !errors.Is(err, ErrObjectiveIncomplete) {
			return fmt.Errorf("incomplete objective err = %v, want ErrObjectiveIncomplete", err)
		}
		if _, err := repo.ClaimObjective(ctx, club, seasonKey, "not-an-objective", inSeason); !errors.Is(err, ErrObjectiveNotFound) {
			return fmt.Errorf("unknown objective err = %v, want ErrObjectiveNotFound", err)
		}

		// --- Raise the club, add a raid win and 3 honours -------------------
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "ClubhouseTier"=3 WHERE "_id"=$1`, club); err != nil {
			return err
		}
		if _, err := repo.ClaimObjective(ctx, club, seasonKey, "clubhouse-tier-3", inSeason); err != nil {
			return fmt.Errorf("claim clubhouse-tier-3: %w", err)
		}
		raidID := insertRaidWin(t, ctx, tx, club, defender, 3, time.Date(2026, 9, 5, 12, 0, 0, 0, time.UTC))
		if _, err := repo.ClaimObjective(ctx, club, seasonKey, "season-kickoff", inSeason); err != nil {
			return fmt.Errorf("claim season-kickoff: %w", err)
		}
		// Only one win: raid-wins-5 stays incomplete.
		if _, err := repo.ClaimObjective(ctx, club, seasonKey, "raid-wins-5", inSeason); !errors.Is(err, ErrObjectiveIncomplete) {
			return fmt.Errorf("raid-wins-5 err = %v, want ErrObjectiveIncomplete", err)
		}
		for i, code := range []string{"first-blood", "fan-favourite", "clubhouse-t3"} {
			if _, err := tx.Exec(ctx, `INSERT INTO "Honours" ("ClubId","Code","Progress","CompletedAt","updatedAt")
				VALUES ($1,$2,3,$3,now())`, club, code, time.Date(2026, 9, 6+i, 10, 0, 0, 0, time.UTC)); err != nil {
				return err
			}
		}
		payload, err = repo.ClaimObjective(ctx, club, seasonKey, "honours-3", inSeason)
		if err != nil {
			return fmt.Errorf("claim honours-3: %w", err)
		}
		if got := intOf(payload["points"]); got != 1300 {
			return fmt.Errorf("season points = %d, want 1300", got)
		}
		if got := intOf(payload["tier"]); got != 5 {
			return fmt.Errorf("season tier = %d, want 5", got)
		}

		// --- Season Bank: exactly once per source --------------------------
		banked, err := repo.AccrueRaidLoot(ctx, club, inSeason, raidID, 1000)
		if err != nil || banked != 200 {
			return fmt.Errorf("raid accrual = %d/%v, want 200", banked, err)
		}
		again, err := repo.AccrueRaidLoot(ctx, club, inSeason, raidID, 1000)
		if err != nil || again != 0 {
			return fmt.Errorf("duplicate raid accrual = %d/%v, want 0", again, err)
		}
		derby, err := repo.AccrueFromLoot(ctx, club, seasonKey, "derby:d1", 500)
		if err != nil || derby != 100 {
			return fmt.Errorf("derby accrual = %d/%v, want 100", derby, err)
		}
		accrued, claimed, _, err := bankRow(ctx, tx, club, seasonKey)
		if err != nil {
			return err
		}
		if int(accrued) != 300 || claimed != 0 {
			return fmt.Errorf("bank accrued/claimed = %.0f/%.0f, want 300/0", accrued, claimed)
		}

		// --- Pass-track gating ---------------------------------------------
		if _, err := repo.ClaimPass(ctx, club, seasonKey, Track("bronze"), inSeason); !errors.Is(err, ErrUnknownTrack) {
			return fmt.Errorf("unknown track err = %v, want ErrUnknownTrack", err)
		}
		noPass := newTestClub(t, ctx, tx, map[string]any{"ClubhouseTier": 3, "SponsorCredits": 0})
		if _, err := repo.ClaimPass(ctx, noPass, seasonKey, Gold, inSeason); !errors.Is(err, ErrPassRequired) {
			return fmt.Errorf("gold without pass err = %v, want ErrPassRequired", err)
		}
		// Actually reach a tier with noPass so the gate is the *only* blocker.
		if _, err := repo.ClaimObjective(ctx, noPass, seasonKey, "clubhouse-tier-2", inSeason); err != nil {
			return err
		}
		if _, err := repo.ClaimPass(ctx, noPass, seasonKey, Gold, inSeason); !errors.Is(err, ErrPassRequired) {
			return fmt.Errorf("gold w/o pass (tier reached) err = %v, want ErrPassRequired", err)
		}
		if _, err := repo.ClaimPass(ctx, noPass, seasonKey, Silver, inSeason); err != nil {
			return fmt.Errorf("silver must be free: %w", err)
		}

		// --- Silver + Gold claims (tier 5 reached) --------------------------
		for i := 0; i < 5; i++ {
			if _, err := repo.ClaimPass(ctx, club, seasonKey, Silver, inSeason); err != nil {
				return fmt.Errorf("silver claim %d: %w", i+1, err)
			}
		}
		if _, err := repo.ClaimPass(ctx, club, seasonKey, Silver, inSeason); !errors.Is(err, ErrNothingToClaim) {
			return fmt.Errorf("over-claim silver err = %v, want ErrNothingToClaim", err)
		}
		for i := 0; i < 5; i++ {
			if _, err := repo.ClaimPass(ctx, club, seasonKey, Gold, inSeason); err != nil {
				return fmt.Errorf("gold claim %d: %w", i+1, err)
			}
		}
		if _, err := repo.ClaimPass(ctx, club, seasonKey, Gold, inSeason); !errors.Is(err, ErrNothingToClaim) {
			return fmt.Errorf("over-claim gold err = %v, want ErrNothingToClaim", err)
		}

		// Tier rewards wrote currency + Perks to the ledger/inventory.
		if n := ledgerCount(t, ctx, tx, club, "season_reward"); n == 0 {
			return fmt.Errorf("tier claims must write season_reward ledger rows")
		}
		perks, err := repo.ListPerks(ctx, club)
		if err != nil {
			return err
		}
		perkCount := map[string]int{}
		for _, p := range perks {
			m := p.(map[string]any)
			perkCount[db.StringField(m, "perk")] = intOf(m["count"])
		}
		// Silver tier 4 → resource_cache x1; Gold tiers 2 & 4 → instant_finish x2.
		if perkCount[PerkResourceCache] != 1 {
			return fmt.Errorf("resource_cache = %d, want 1", perkCount[PerkResourceCache])
		}
		if perkCount[PerkInstantFinish] != 2 {
			return fmt.Errorf("instant_finish = %d, want 2", perkCount[PerkInstantFinish])
		}
		// Perks are consumable; a spend beyond the balance is refused.
		if err := repo.SpendPerk(ctx, club, PerkResourceCache, 1); err != nil {
			return fmt.Errorf("spend perk: %w", err)
		}
		if err := repo.SpendPerk(ctx, club, PerkResourceCache, 1); !errors.Is(err, ErrInsufficientPerks) {
			return fmt.Errorf("overspend err = %v, want ErrInsufficientPerks", err)
		}

		// --- Bank claim: gated to season end, idempotent --------------------
		if _, err := repo.ClaimBank(ctx, club, seasonKey, inSeason); !errors.Is(err, ErrSeasonNotEnded) {
			return fmt.Errorf("early bank claim err = %v, want ErrSeasonNotEnded", err)
		}
		budgetBefore := floatOf(clubField(t, ctx, tx, club, "Budget"))
		payload, err = repo.ClaimBank(ctx, club, seasonKey, afterSeason)
		if err != nil {
			return fmt.Errorf("bank claim: %w", err)
		}
		if got := floatOf(payload["bank"].(map[string]any)["claimable"]); got != 0 {
			return fmt.Errorf("claimable after claim = %.0f, want 0", got)
		}
		if got := floatOf(clubField(t, ctx, tx, club, "Budget")); got != budgetBefore+300 {
			return fmt.Errorf("cash after bank claim = %.0f, want %.0f", got, budgetBefore+300)
		}
		if _, err := repo.ClaimBank(ctx, club, seasonKey, afterSeason); !errors.Is(err, ErrNothingToClaim) {
			return fmt.Errorf("second bank claim err = %v, want ErrNothingToClaim", err)
		}

		// --- No orphaned claims (every claim maps to a catalogue row) -------
		if err := assertNoOrphanClaims(ctx, tx, club, seasonKey); err != nil {
			return err
		}

		// =====================================================================
		// Reads: missing club, malformed season.
		// =====================================================================
		if _, ok, err := repo.BuildSeason(ctx, "00000000-0000-0000-0000-000000000000", seasonKey, inSeason); err != nil || ok {
			return fmt.Errorf("missing club: ok=%v err=%v", ok, err)
		}
		if _, _, err := repo.BuildSeason(ctx, club, "not-a-month", inSeason); err == nil {
			return fmt.Errorf("malformed season key must error")
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back season: %v", err)
	}
}

// TestSeasonTierGrantWritesClubsPerksRolledBack proves a Silver tier claim
// populates Clubs.Perks exactly once (the SeasonClaims guard), so the campus
// consume path can redeem it and a re-claim cannot double-grant.
func TestSeasonTierGrantWritesClubsPerksRolledBack(t *testing.T) {
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

	const seasonKey = "2026-09"
	inSeason := time.Date(2026, 9, 15, 12, 0, 0, 0, time.UTC)
	run := func(tx db.Querier) error {
		repo := NewRepository(tx)
		club := newTestClub(t, ctx, tx, map[string]any{"Budget": 0.0, "ClubhouseTier": 5})
		// Seed objective points directly (tier 4 needs 800).
		if _, err := tx.Exec(ctx, `INSERT INTO "SeasonClaims" ("ClubId","SeasonKey","Track","Tier","Points","updatedAt")
			VALUES ($1,$2,'objective',1,800,now())`, club, seasonKey); err != nil {
			return err
		}
		for i := 0; i < 4; i++ {
			if _, err := repo.ClaimPass(ctx, club, seasonKey, Silver, inSeason); err != nil {
				return fmt.Errorf("silver claim %d: %w", i+1, err)
			}
		}
		if _, err := repo.ClaimPass(ctx, club, seasonKey, Silver, inSeason); !errors.Is(err, ErrNothingToClaim) {
			return fmt.Errorf("over-claim err = %v, want ErrNothingToClaim", err)
		}
		row, ok, err := one(ctx, tx, `SELECT "Perks" FROM "Clubs" WHERE "_id" = $1`, club)
		if err != nil || !ok {
			return fmt.Errorf("read Clubs.Perks: ok=%v err=%v", ok, err)
		}
		perks, _ := row["Perks"].(map[string]any)
		if got := campus.PerkCount(perks, PerkResourceCache); got != 1 {
			return fmt.Errorf("Clubs.Perks resource_cache = %d, want 1", got)
		}
		// The season read reflects the same inventory.
		list, err := repo.ListPerks(ctx, club)
		if err != nil {
			return err
		}
		owned := map[string]int{}
		for _, p := range list {
			m := p.(map[string]any)
			owned[db.StringField(m, "perk")] = intOf(m["count"])
		}
		if owned[PerkResourceCache] != 1 {
			return fmt.Errorf("ListPerks resource_cache = %d, want 1", owned[PerkResourceCache])
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back season perk grant: %v", err)
	}
}

// assertNoOrphanClaims proves every SeasonClaims row references a catalogue
// entity (the P8 exit criterion): objective claims map to a seeded
// SeasonObjectives code at their ordinal, track claims map to a SeasonTiers tier,
// and the pass entitlement is tier 0.
func assertNoOrphanClaims(ctx context.Context, q db.Querier, clubID, seasonKey string) error {
	rows, err := q.Query(ctx, `SELECT "Track","Tier" FROM "SeasonClaims" WHERE "ClubId"=$1 AND "SeasonKey"=$2 ORDER BY "Track","Tier"`, clubID, seasonKey)
	if err != nil {
		return err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return err
	}
	if len(list) == 0 {
		return fmt.Errorf("no claims recorded")
	}
	for _, m := range list {
		track := db.StringField(m, "Track")
		tier := intOf(m["Tier"])
		switch track {
		case trackObjective:
			obj, ok := ObjectiveByOrdinal(tier)
			if !ok {
				return fmt.Errorf("orphaned objective claim at ordinal %d", tier)
			}
			n, _, err := one(ctx, q, `SELECT "_id" FROM "SeasonObjectives" WHERE "SeasonKey"=$1 AND "Code"=$2`, seasonKey, obj.Code)
			if err != nil || n == nil {
				return fmt.Errorf("objective %s (ordinal %d) has no catalogue row", obj.Code, tier)
			}
		case string(Silver), string(Gold):
			if tier < 1 || tier > MaxTier() {
				return fmt.Errorf("orphaned %s claim at tier %d", track, tier)
			}
			n, _, err := one(ctx, q, `SELECT "_id" FROM "SeasonTiers" WHERE "SeasonKey"=$1 AND "Tier"=$2`, seasonKey, tier)
			if err != nil || n == nil {
				return fmt.Errorf("%s tier %d has no catalogue row", track, tier)
			}
		case trackPass:
			if tier != 0 {
				return fmt.Errorf("pass entitlement must be tier 0, got %d", tier)
			}
		default:
			return fmt.Errorf("unknown claim track %q", track)
		}
	}
	return nil
}
