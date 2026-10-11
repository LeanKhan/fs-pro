package league

import (
	"context"
	"fmt"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

var leagueSeq int64

// ensureLeagueSchema creates the ladder tables inside the caller's rolled-back
// transaction when the migrations have not run, so the tests are self
// sufficient. The real (migrated) tables use the same names/columns.
func ensureLeagueSchema(ctx context.Context, q db.Querier) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS "StandingPools" (
			"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			"LeagueCode" text NOT NULL,
			"WeekKey" text NOT NULL,
			"ClubId" uuid NOT NULL,
			"Pool" integer NOT NULL DEFAULT 0,
			"Attacks" integer NOT NULL DEFAULT 0,
			"Defenses" integer NOT NULL DEFAULT 0,
			"Stars" integer NOT NULL DEFAULT 0,
			"Placement" integer,
			"createdAt" timestamp(3) NOT NULL DEFAULT now(),
			"updatedAt" timestamp(3) NOT NULL DEFAULT now(),
			UNIQUE ("WeekKey", "ClubId"))`,
		`CREATE TABLE IF NOT EXISTS "StandingResults" (
			"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			"ClubId" uuid NOT NULL,
			"WeekKey" text NOT NULL,
			"LeagueCode" text NOT NULL,
			"Delta" integer NOT NULL DEFAULT 0,
			"Standing" integer NOT NULL DEFAULT 0,
			"Outcome" text NOT NULL,
			"createdAt" timestamp(3) NOT NULL DEFAULT now(),
			"updatedAt" timestamp(3) NOT NULL DEFAULT now(),
			UNIQUE ("WeekKey", "ClubId"))`,
		`CREATE TABLE IF NOT EXISTS "FormBonus" (
			"ClubId" uuid PRIMARY KEY,
			"Entries" jsonb NOT NULL DEFAULT '[]'::jsonb,
			"EarnedAt" timestamp(3),
			"Credited" real NOT NULL DEFAULT 0,
			"updatedAt" timestamp(3) NOT NULL DEFAULT now())`,
		`CREATE TABLE IF NOT EXISTS "BoardVault" (
			"ClubId" uuid PRIMARY KEY,
			"Balance" real NOT NULL DEFAULT 0,
			"updatedAt" timestamp(3) NOT NULL DEFAULT now())`,
	}
	for _, s := range stmts {
		if _, err := q.Exec(ctx, s); err != nil {
			return err
		}
	}
	return nil
}

func leaguePool(t *testing.T) (context.Context, func(func(db.Querier) error)) {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := db.New(ctx, url, 15*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	t.Cleanup(pool.Close)
	return ctx, func(fn func(db.Querier) error) {
		if err := db.InRollback(ctx, pool, fn); err != nil {
			t.Fatalf("rolled-back tx: %v", err)
		}
	}
}

func leagueClub(t *testing.T, ctx context.Context, q db.Querier, name string, standing int) string {
	t.Helper()
	code := fmt.Sprintf("LG%04d", atomic.AddInt64(&leagueSeq, 1))
	row, err := db.InsertRow(ctx, q, "Clubs", map[string]any{
		"Name": name, "ClubCode": code, "StandingPoints": standing, "ClubhouseTier": 1, "updatedAt": time.Now(),
	})
	if err != nil {
		t.Fatalf("insert club: %v", err)
	}
	return db.StringField(row, "_id")
}

func leagueOne(t *testing.T, ctx context.Context, q db.Querier, sql string, args ...any) (map[string]any, bool) {
	t.Helper()
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil {
		t.Fatalf("scan: %v", err)
	}
	return m, ok
}

func leagueCount(t *testing.T, ctx context.Context, q db.Querier, sql string, args ...any) int {
	t.Helper()
	m, _ := leagueOne(t, ctx, q, sql, args...)
	return intOf(m["n"])
}

func standingOf(t *testing.T, ctx context.Context, q db.Querier, clubID string) int {
	t.Helper()
	m, _ := leagueOne(t, ctx, q, `SELECT "StandingPoints" FROM "Clubs" WHERE "_id"=$1`, clubID)
	return intOf(m["StandingPoints"])
}

// TestStandingRead proves the read model maps points to the right league, code
// and multiplier.
func TestStandingRead(t *testing.T) {
	ctx, inRollback := leaguePool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensureLeagueSchema(ctx, tx); err != nil {
			return err
		}
		club := leagueClub(t, ctx, tx, "Standing FC", 1000) // Silver I
		repo := NewRepository(tx)
		got, ok, err := repo.Standing(ctx, club)
		if err != nil || !ok {
			return fmt.Errorf("standing: ok=%v err=%v", ok, err)
		}
		if got["leagueCode"] != "silver_1" || intOf(got["division"]) != 1 || intOf(got["multiplierX100"]) != 125 {
			t.Errorf("standing = %#v", got)
		}
		if intOf(got["rank"]) < 1 {
			t.Errorf("rank = %v, want >= 1", got["rank"])
		}
		return nil
	})
}

// TestSignupIdempotent proves signing up creates one pool row and a repeated
// signup returns the same pool without a second row.
func TestSignupIdempotent(t *testing.T) {
	ctx, inRollback := leaguePool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensureLeagueSchema(ctx, tx); err != nil {
			return err
		}
		club := leagueClub(t, ctx, tx, "Signup FC", 1000) // Silver I → 11 attacks
		repo := NewRepository(tx)
		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

		first, err := repo.Signup(ctx, club, now)
		if err != nil {
			return err
		}
		if intOf(first["pool"]) != 0 || intOf(first["attacksAllowed"]) != 11 {
			t.Errorf("first signup = %#v, want pool 0 / 11 attacks", first)
		}
		second, err := repo.Signup(ctx, club, now)
		if err != nil {
			return err
		}
		if intOf(second["pool"]) != intOf(first["pool"]) {
			t.Errorf("second signup changed pool: %d -> %d", intOf(first["pool"]), intOf(second["pool"]))
		}
		if n := leagueCount(t, ctx, tx, `SELECT count(*)::int AS n FROM "StandingPools" WHERE "ClubId"=$1`, club); n != 1 {
			t.Errorf("pool rows = %d, want 1", n)
		}
		return nil
	})
}

// TestSignupAssignsFreshPoolWhenFull proves pool assignment overflows to a new
// pool once the current one has PoolSize members.
func TestSignupAssignsFreshPoolWhenFull(t *testing.T) {
	ctx, inRollback := leaguePool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensureLeagueSchema(ctx, tx); err != nil {
			return err
		}
		week := WeekKey(time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC))
		for i := 0; i < PoolSize; i++ {
			c := leagueClub(t, ctx, tx, fmt.Sprintf("Fill %d", i), 1000)
			if _, err := tx.Exec(ctx, `INSERT INTO "StandingPools" ("LeagueCode","WeekKey","ClubId","Pool","updatedAt")
				VALUES ('silver_1',$1,$2,0,now())`, week, c); err != nil {
				return err
			}
		}
		club := leagueClub(t, ctx, tx, "Overflow FC", 1000)
		got, err := NewRepository(tx).Signup(ctx, club, time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC))
		if err != nil {
			return err
		}
		if intOf(got["pool"]) != 1 {
			t.Errorf("overflow pool = %v, want 1", got["pool"])
		}
		return nil
	})
}

// TestSignupRefusesUnranked proves a club below Bronze III is refused.
func TestSignupRefusesUnranked(t *testing.T) {
	ctx, inRollback := leaguePool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensureLeagueSchema(ctx, tx); err != nil {
			return err
		}
		club := leagueClub(t, ctx, tx, "Rookie FC", 0)
		if _, err := NewRepository(tx).Signup(ctx, club, time.Now().UTC()); err != ErrNotRanked {
			t.Errorf("unranked signup err = %v, want ErrNotRanked", err)
		}
		return nil
	})
}

// TestFormBonusAccrualCreditsBoardVault proves the 5th star credits the bonus
// into the Board Vault with a ledger row, and a repeated raid is a no-op.
func TestFormBonusAccrualCreditsBoardVault(t *testing.T) {
	ctx, inRollback := leaguePool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensureLeagueSchema(ctx, tx); err != nil {
			return err
		}
		club := leagueClub(t, ctx, tx, "Bonus FC", 1000) // Silver I → x1.25
		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
		for i := 0; i < 4; i++ {
			if earned, _, err := AccrueFormBonus(ctx, tx, club, fmt.Sprintf("raid-%d", i), 1, now.Add(time.Duration(i)*time.Minute)); err != nil {
				return err
			} else if earned {
				t.Fatalf("bonus earned early at raid %d", i)
			}
		}
		earned, credited, err := AccrueFormBonus(ctx, tx, club, "raid-4", 1, now.Add(4*time.Minute))
		if err != nil {
			return err
		}
		if !earned {
			t.Fatal("the 5th star must earn the bonus")
		}
		want := FormBonusLoot(125)
		if credited != want {
			t.Fatalf("credited = %d, want %d", credited, want)
		}
		if n := leagueCount(t, ctx, tx, `SELECT count(*)::int AS n FROM "BoardVault" WHERE "ClubId"=$1 AND "Balance"=$2`, club, want); n != 1 {
			t.Errorf("Board Vault credit rows = %d, want 1", n)
		}
		if n := leagueCount(t, ctx, tx, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "Type"='form_bonus' AND "BuyerClubId"=$1`, club); n != 1 {
			t.Errorf("form_bonus ledger rows = %d, want 1", n)
		}
		// The once-only guard: re-applying the same raid adds nothing.
		earned2, credited2, err := AccrueFormBonus(ctx, tx, club, "raid-4", 1, now.Add(4*time.Minute))
		if err != nil {
			return err
		}
		if earned2 || credited2 != 0 {
			t.Errorf("duplicate raid re-earned the bonus: earned=%v credited=%d", earned2, credited2)
		}
		if n := leagueCount(t, ctx, tx, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "Type"='form_bonus' AND "BuyerClubId"=$1`, club); n != 1 {
			t.Errorf("duplicate raid added a ledger row (now %d)", n)
		}
		// The earned bonus reads as ready until the Board Vault is claimed.
		repo := NewRepository(tx)
		state, ok, err := repo.FormBonusState(ctx, club, now.Add(5*time.Minute))
		if err != nil || !ok {
			return fmt.Errorf("form bonus state: ok=%v err=%v", ok, err)
		}
		if state["ready"] != true {
			t.Errorf("form bonus ready = %v, want true", state["ready"])
		}
		if err := ClearFormBonusEarned(ctx, tx, club); err != nil {
			return err
		}
		state2, _, err := repo.FormBonusState(ctx, club, now.Add(5*time.Minute))
		if err != nil {
			return err
		}
		if state2["ready"] != false {
			t.Errorf("form bonus ready after claim = %v, want false", state2["ready"])
		}
		return nil
	})
}

// TestRecordRankedRaidUpdatesPoolCounters proves a ranked raid bumps the
// attacker's stars/attacks and the defender's defenses for a signed-up club.
func TestRecordRankedRaidUpdatesPoolCounters(t *testing.T) {
	ctx, inRollback := leaguePool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensureLeagueSchema(ctx, tx); err != nil {
			return err
		}
		a := leagueClub(t, ctx, tx, "Ladder A", 1000)
		b := leagueClub(t, ctx, tx, "Ladder B", 1000)
		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
		week := WeekKey(now)
		for _, c := range []string{a, b} {
			if _, err := tx.Exec(ctx, `INSERT INTO "StandingPools" ("LeagueCode","WeekKey","ClubId","Pool","updatedAt")
				VALUES ('silver_1',$1,$2,0,now())`, week, c); err != nil {
				return err
			}
		}
		if err := RecordRankedRaid(ctx, tx, "raid-xyz", a, b, 3, now); err != nil {
			return err
		}
		poolA, _ := leagueOne(t, ctx, tx, `SELECT "Attacks","Stars","Defenses" FROM "StandingPools" WHERE "ClubId"=$1 AND "WeekKey"=$2`, a, week)
		if intOf(poolA["Attacks"]) != 1 || intOf(poolA["Stars"]) != 3 || intOf(poolA["Defenses"]) != 0 {
			t.Errorf("attacker pool = %#v, want attacks=1 stars=3 defenses=0", poolA)
		}
		poolB, _ := leagueOne(t, ctx, tx, `SELECT "Attacks","Defenses" FROM "StandingPools" WHERE "ClubId"=$1 AND "WeekKey"=$2`, b, week)
		if intOf(poolB["Defenses"]) != 1 || intOf(poolB["Attacks"]) != 0 {
			t.Errorf("defender pool = %#v, want defenses=1 attacks=0", poolB)
		}
		return nil
	})
}

// TestRolloverIdempotent proves one closed week promotes the top, relegates the
// bottom, resets everyone else, and a repeated tick changes nothing.
func TestRolloverIdempotent(t *testing.T) {
	ctx, inRollback := leaguePool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensureLeagueSchema(ctx, tx); err != nil {
			return err
		}
		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
		week := PreviousWeekKey(now)
		clubs := make([]string, 10)
		for i := 0; i < 10; i++ {
			clubs[i] = leagueClub(t, ctx, tx, fmt.Sprintf("Pool %d", i), 950)
			if _, err := tx.Exec(ctx, `INSERT INTO "StandingPools" ("LeagueCode","WeekKey","ClubId","Pool","Stars","updatedAt")
				VALUES ('silver_2',$1,$2,0,$3,now())`, week, clubs[i], 10-i); err != nil {
				return err
			}
		}
		rep, err := Rollover(ctx, tx, now)
		if err != nil {
			return err
		}
		if rep.Weekly != 10 {
			t.Fatalf("weekly settled = %d, want 10", rep.Weekly)
		}
		// clubs[0] has 10 stars → placement 1 → promoted to Silver I (1000).
		if got := standingOf(t, ctx, tx, clubs[0]); got != 1000 {
			t.Errorf("promoted standing = %d, want 1000", got)
		}
		// clubs[9] has 1 star → placement 10 → relegated to Silver III (800).
		if got := standingOf(t, ctx, tx, clubs[9]); got != 800 {
			t.Errorf("relegated standing = %d, want 800", got)
		}
		// A middle club holds and resets to its rung floor (900).
		if got := standingOf(t, ctx, tx, clubs[4]); got != 900 {
			t.Errorf("held standing = %d, want 900 (reset floor)", got)
		}
		rows := leagueCount(t, ctx, tx, `SELECT count(*)::int AS n FROM "StandingResults" WHERE "WeekKey"=$1`, week)
		if rows != 10 {
			t.Fatalf("StandingResults rows = %d, want 10", rows)
		}
		// Second tick: nothing left to settle, standings unchanged.
		rep2, err := Rollover(ctx, tx, now)
		if err != nil {
			return err
		}
		if rep2.Weekly != 0 {
			t.Errorf("second tick weekly = %d, want 0 (idempotent)", rep2.Weekly)
		}
		if got := standingOf(t, ctx, tx, clubs[0]); got != 1000 {
			t.Errorf("promoted standing changed on retick: %d", got)
		}
		if n := leagueCount(t, ctx, tx, `SELECT count(*)::int AS n FROM "StandingResults" WHERE "WeekKey"=$1`, week); n != 10 {
			t.Errorf("retick added results (now %d)", n)
		}
		return nil
	})
}

// TestRolloverApexMonthlyReset proves an apex club resets to the apex floor on
// the monthly cadence and not weekly, once.
func TestRolloverApexMonthlyReset(t *testing.T) {
	ctx, inRollback := leaguePool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensureLeagueSchema(ctx, tx); err != nil {
			return err
		}
		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
		club := leagueClub(t, ctx, tx, "Legend FC", 3300)
		if _, err := tx.Exec(ctx, `INSERT INTO "StandingPools" ("LeagueCode","WeekKey","ClubId","Pool","updatedAt")
			VALUES ('legend',$1,$2,0,now())`, PreviousWeekKey(now), club); err != nil {
			return err
		}
		rep, err := Rollover(ctx, tx, now)
		if err != nil {
			return err
		}
		if rep.Weekly != 0 {
			t.Errorf("apex must not be settled weekly: weekly=%d", rep.Weekly)
		}
		if rep.Monthly != 1 {
			t.Fatalf("apex monthly settled = %d, want 1", rep.Monthly)
		}
		if got := standingOf(t, ctx, tx, club); got != 3200 {
			t.Errorf("apex standing = %d, want the apex floor 3200", got)
		}
		rep2, err := Rollover(ctx, tx, now)
		if err != nil {
			return err
		}
		if rep2.Monthly != 0 {
			t.Errorf("second tick monthly = %d, want 0 (idempotent)", rep2.Monthly)
		}
		return nil
	})
}

// TestPoolReadNotFound proves an unsigned club has no current-week pool.
func TestPoolReadNotFound(t *testing.T) {
	ctx, inRollback := leaguePool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensureLeagueSchema(ctx, tx); err != nil {
			return err
		}
		club := leagueClub(t, ctx, tx, "Unsigned FC", 1000)
		_, ok, err := NewRepository(tx).Pool(ctx, club, time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC))
		if err != nil {
			return err
		}
		if ok {
			t.Error("an unsigned club must have no pool")
		}
		return nil
	})
}
