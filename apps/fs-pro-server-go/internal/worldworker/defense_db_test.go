package worldworker

import (
	"context"
	"fmt"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/play"
)

var defenseSeq int64

// TestDefenseResolutionTickerRolledBack proves the offline-defense path: a
// queued (pending) raid is resolved by the worker ticker against the defender's
// snapshot, applies the same raid effects, and cannot double-apply on a second
// tick (the RaidResults guard).
func TestDefenseResolutionTickerRolledBack(t *testing.T) {
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
	sim := func(context.Context, map[string]any) (map[string]any, error) {
		return map[string]any{
			"Details": map[string]any{
				"HomeTeamScore": 2, "AwayTeamScore": 0,
				"HomeTeamDetails": map[string]any{"Possession": 60.0, "XG": 2.0},
				"AwayTeamDetails": map[string]any{"Possession": 40.0, "XG": 0.7},
			},
			"Events": []any{},
			"Frames": map[string]any{},
		}, nil
	}
	tick := DefenseResolutionTicker(func() time.Time { return now }, sim)
	if tick.ID != "defenses" || tick.LockKey != LockDefenses || tick.Interval != DefensesInterval {
		t.Fatalf("unexpected defense ticker: %+v", tick)
	}

	run := func(tx db.Querier) error {
		if err := ensureDefenseTables(ctx, tx); err != nil {
			return err
		}
		a, err := workerClub(ctx, tx, "Worker Attacker")
		if err != nil {
			return err
		}
		b, err := workerClub(ctx, tx, "Worker Defender")
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Budget"=$2, "Fans"=$3 WHERE "_id"=$1`, a, 0.0, 0); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Budget"=$2, "Fans"=$3 WHERE "_id"=$1`, b, 100000.0, 1000); err != nil {
			return err
		}

		repo := play.NewRepository(tx)
		ref, err := repo.QueueRaid(ctx, play.RaidRequest{AttackerID: a, DefenderID: b, Seed: "worker-1"})
		if err != nil {
			return err
		}
		// Pending and unresolved.
		status := raidStatus(t, ctx, tx, ref.RaidID)
		if status != "pending" {
			return fmt.Errorf("queued raid status = %q, want pending", status)
		}

		if err := tick.Job(ctx, tx); err != nil {
			return fmt.Errorf("first tick: %w", err)
		}
		if status := raidStatus(t, ctx, tx, ref.RaidID); status != "resolved" {
			return fmt.Errorf("after tick status = %q, want resolved", status)
		}
		guards := countRowsDB(t, ctx, tx, `SELECT count(*)::int AS n FROM "RaidResults" WHERE "RaidId"=$1`, ref.RaidID)
		if guards != 1 {
			return fmt.Errorf("RaidResults rows = %d, want 1", guards)
		}
		// The defender was debited and notified; the attacker gained loot.
		if clubBudget(t, ctx, tx, b) >= 100000 {
			return fmt.Errorf("defender was not raided")
		}
		if clubBudget(t, ctx, tx, a) <= 0 {
			return fmt.Errorf("attacker gained no loot")
		}
		if n := countRowsDB(t, ctx, tx, `SELECT count(*)::int AS n FROM "ClubMessages" WHERE "ClubId"=$1`, b); n < 1 {
			return fmt.Errorf("defender not notified")
		}

		// Second tick: nothing left to resolve, effects untouched.
		aBudget := clubBudget(t, ctx, tx, a)
		bBudget2 := clubBudget(t, ctx, tx, b)
		if err := tick.Job(ctx, tx); err != nil {
			return fmt.Errorf("second tick: %w", err)
		}
		if clubBudget(t, ctx, tx, a) != aBudget || clubBudget(t, ctx, tx, b) != bBudget2 {
			return fmt.Errorf("second tick reapplied effects")
		}
		if n := countRowsDB(t, ctx, tx, `SELECT count(*)::int AS n FROM "RaidResults" WHERE "RaidId"=$1`, ref.RaidID); n != 1 {
			return fmt.Errorf("RaidResults rows after second tick = %d, want 1", n)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back defense tick: %v", err)
	}
}

// TestShieldsTickerWiring pins the shield sweep's id/lock/interval.
func TestShieldsTickerWiring(t *testing.T) {
	tick := ShieldsTicker(nil)
	if tick.ID != "shields" || tick.LockKey != LockShields || tick.Interval != ShieldsInterval {
		t.Fatalf("unexpected shields ticker: %+v", tick)
	}
	if tick.Job == nil {
		t.Fatal("shields ticker has no job")
	}
}

func ensureDefenseTables(ctx context.Context, q db.Querier) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS "Raids" (
			"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
			"FixtureId" uuid, "AttackerClubId" uuid NOT NULL, "DefenderClubId" uuid NOT NULL,
			"Seed" text NOT NULL, "Practice" boolean NOT NULL DEFAULT false, "Watch" boolean NOT NULL DEFAULT false,
			"Status" text NOT NULL DEFAULT 'pending', "Request" jsonb, "Result" jsonb,
			"ResolveAt" timestamp(3) NOT NULL DEFAULT now(), "ResolvedAt" timestamp(3),
			"createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now())`,
		`CREATE TABLE IF NOT EXISTS "RaidResults" (
			"RaidId" uuid PRIMARY KEY, "AttackerClubId" uuid NOT NULL, "DefenderClubId" uuid NOT NULL,
			"Practice" boolean NOT NULL DEFAULT false, "Stars" integer NOT NULL DEFAULT 0,
			"AttackerGoals" integer NOT NULL DEFAULT 0, "DefenderGoals" integer NOT NULL DEFAULT 0,
			"Dominance" real NOT NULL DEFAULT 0, "StolenCash" real NOT NULL DEFAULT 0,
			"StolenFans" integer NOT NULL DEFAULT 0, "StolenTokens" integer NOT NULL DEFAULT 0,
			"SystemBonus" real NOT NULL DEFAULT 0, "StandingAttacker" integer NOT NULL DEFAULT 0,
			"StandingDefender" integer NOT NULL DEFAULT 0, "ShieldUntil" timestamp(3), "GuardUntil" timestamp(3),
			"ResolvedAt" timestamp(3) NOT NULL DEFAULT now())`,
		// P6: the ranked-raid hook now accrues the league (Form Bonus + pool
		// counters), so the self-sufficient test schema provides those tables.
		`CREATE TABLE IF NOT EXISTS "FormBonus" (
			"ClubId" uuid PRIMARY KEY, "Entries" jsonb NOT NULL DEFAULT '[]'::jsonb,
			"EarnedAt" timestamp(3), "Credited" real NOT NULL DEFAULT 0,
			"updatedAt" timestamp(3) NOT NULL DEFAULT now())`,
		`CREATE TABLE IF NOT EXISTS "StandingPools" (
			"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "LeagueCode" text NOT NULL,
			"WeekKey" text NOT NULL, "ClubId" uuid NOT NULL, "Pool" integer NOT NULL DEFAULT 0,
			"Attacks" integer NOT NULL DEFAULT 0, "Defenses" integer NOT NULL DEFAULT 0,
			"Stars" integer NOT NULL DEFAULT 0, "Placement" integer,
			"createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
			UNIQUE ("WeekKey", "ClubId"))`,
	}
	for _, s := range stmts {
		if _, err := q.Exec(ctx, s); err != nil {
			return err
		}
	}
	return nil
}

func workerClub(ctx context.Context, q db.Querier, name string) (string, error) {
	code := fmt.Sprintf("WW%04d", atomic.AddInt64(&defenseSeq, 1))
	row, err := db.InsertRow(ctx, q, "Clubs", map[string]any{
		"Name": name, "ClubCode": code, "Budget": 0.0, "Fans": 0, "ScoutTokens": 0,
		"StandingPoints": 1000, "ClubhouseTier": 1, "updatedAt": time.Now(),
	})
	if err != nil {
		return "", err
	}
	clubID := db.StringField(row, "_id")
	positions := []string{"GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "ATT", "ATT"}
	for i, pos := range positions {
		if _, err := q.Exec(ctx, `INSERT INTO "Players" ("ClubId","FirstName","LastName","Position","Rating","isSigned","isRetired","updatedAt")
			VALUES ($1,'Worker',$2,$3,70,true,false,now())`, clubID, fmt.Sprintf("%s %d", name, i), pos); err != nil {
			return "", err
		}
	}
	return clubID, nil
}

func raidStatus(t *testing.T, ctx context.Context, q db.Querier, raidID string) string {
	t.Helper()
	row, ok, err := oneMap(ctx, q, `SELECT "Status" FROM "Raids" WHERE "_id"=$1`, raidID)
	if err != nil || !ok {
		t.Fatalf("raid status: ok=%v err=%v", ok, err)
	}
	return db.StringField(row, "Status")
}

func clubBudget(t *testing.T, ctx context.Context, q db.Querier, clubID string) float64 {
	t.Helper()
	row, ok, err := oneMap(ctx, q, `SELECT "Budget" FROM "Clubs" WHERE "_id"=$1`, clubID)
	if err != nil || !ok {
		t.Fatalf("club budget: ok=%v err=%v", ok, err)
	}
	return floatOf(row["Budget"])
}

func oneMap(ctx context.Context, q db.Querier, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

func countRowsDB(t *testing.T, ctx context.Context, q db.Querier, sql string, args ...any) int {
	t.Helper()
	row, _, err := oneMap(ctx, q, sql, args...)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if row == nil {
		return 0
	}
	return intOf(row["n"])
}

func floatOf(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return 0
	}
}
