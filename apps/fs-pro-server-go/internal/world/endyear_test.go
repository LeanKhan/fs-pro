package world

import (
	"context"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

// TestEndYearRolledBack claims the year (CAS), advances the calendar and writes
// the season report - all inside a transaction that is rolled back.
func TestEndYearRolledBack(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	pool, err := db.New(context.Background(), url, 15*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()
	ctx := context.Background()

	run := func(tx db.Querier) error {
		if _, err := tx.Exec(ctx, `UPDATE "Calendars" SET "CurrentYear" = 1, "YearStartDay" = 0, "CurrentDay" = 10, "updatedAt" = now()`); err != nil {
			return err
		}
		summary, err := EndYear(ctx, tx)
		if err != nil {
			t.Fatalf("EndYear: %v", err)
		}
		if summary == nil {
			t.Fatal("EndYear returned nil")
		}
		if intOf(summary["year"]) != 1 || summary["label"] != "Y1" {
			t.Errorf("summary = %v", summary)
		}
		if intOf(summary["fromDay"]) != 0 || intOf(summary["toDay"]) != 9 {
			t.Errorf("span = %v..%v", summary["fromDay"], summary["toDay"])
		}
		if _, ok := summary["errors"].([]string); !ok {
			t.Errorf("errors type = %T", summary["errors"])
		}
		// The calendar advanced.
		cal, _, err := scanOne(ctx, tx, `SELECT "CurrentYear","YearStartDay" FROM "Calendars" LIMIT 1`)
		if err != nil {
			return err
		}
		if intOf(cal["CurrentYear"]) != 2 || intOf(cal["YearStartDay"]) != 10 {
			t.Errorf("calendar = %v/%v", cal["CurrentYear"], cal["YearStartDay"])
		}
		// The season report was written.
		rep, ok, err := scanOne(ctx, tx, `SELECT "Year" FROM "SeasonReports" WHERE "Year" = 'Y1'`)
		if err != nil {
			return err
		}
		if !ok || rep == nil {
			t.Error("season report Y1 not written")
		}
		// A second call is a no-op (already claimed).
		again, err := EndYear(ctx, tx)
		if err != nil {
			return err
		}
		if again != nil {
			t.Error("second EndYear must return nil")
		}
		t.Logf("endYear: Y%v ended (days %v-%v) -> year %v", summary["year"], summary["fromDay"], summary["toDay"], cal["CurrentYear"])
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back endYear: %v", err)
	}
}

func scanOne(ctx context.Context, q db.Querier, sql string, args ...any) (map[string]any, bool, error) {
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
