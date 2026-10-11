package worldworker

import (
	"context"
	"fmt"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/league"
)

var leagueWWSeq int64

// countRows is a column-keyed single-row count helper for the rollover test.
func countRows(t *testing.T, ctx context.Context, q db.Querier, sql string, args ...any) int {
	t.Helper()
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		t.Fatalf("count query: %v", err)
	}
	m, _, err := db.ScanOne(rows)
	if err != nil {
		t.Fatalf("count scan: %v", err)
	}
	return intOf(m["n"])
}

func ensureLeagueRolloverSchema(ctx context.Context, q db.Querier) error {
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
	}
	for _, s := range stmts {
		if _, err := q.Exec(ctx, s); err != nil {
			return err
		}
	}
	return nil
}

// TestLeagueRolloverTickerJobRolledBack runs the registered rollover job twice
// against a real database inside an always-rolled-back transaction: the first
// tick settles the closed week, the second changes nothing (idempotent).
func TestLeagueRolloverTickerJobRolledBack(t *testing.T) {
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

	tick := LeagueRolloverTicker(func() time.Time { return now })
	if tick.ID != "league" || tick.LockKey != LockLeague {
		t.Fatalf("unexpected league ticker: %+v", tick)
	}

	run := func(tx db.Querier) error {
		if err := ensureLeagueRolloverSchema(ctx, tx); err != nil {
			return err
		}
		week := league.PreviousWeekKey(now) // the closed ISO week
		for i := 0; i < 10; i++ {
			code := fmt.Sprintf("WWLG%04d", atomic.AddInt64(&leagueWWSeq, 1))
			row, err := db.InsertRow(ctx, tx, "Clubs", map[string]any{
				"Name": "Ladder " + code, "ClubCode": code, "StandingPoints": 950, "updatedAt": time.Now(),
			})
			if err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `INSERT INTO "StandingPools" ("LeagueCode","WeekKey","ClubId","Pool","Stars","updatedAt")
				VALUES ('silver_2',$1,$2,0,$3,now())`, week, db.StringField(row, "_id"), 10-i); err != nil {
				return err
			}
		}

		if err := tick.Job(ctx, tx); err != nil {
			return fmt.Errorf("first tick: %w", err)
		}
		first := countRows(t, ctx, tx, `SELECT count(*)::int AS n FROM "StandingResults" WHERE "WeekKey"=$1`, week)
		if first != 10 {
			return fmt.Errorf("first tick settled %d clubs, want 10", first)
		}

		if err := tick.Job(ctx, tx); err != nil {
			return fmt.Errorf("second tick: %w", err)
		}
		second := countRows(t, ctx, tx, `SELECT count(*)::int AS n FROM "StandingResults" WHERE "WeekKey"=$1`, week)
		if second != 10 {
			return fmt.Errorf("second tick settled more clubs (%d), not idempotent", second)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back league tick: %v", err)
	}
}
