package grid

import (
	"context"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

// TestPgRepositoryRolledBack exercises the pgx store against a real database,
// inside a transaction that is always rolled back (the pattern used across the
// repo). It is skipped without DATABASE_URL, and also skipped until the
// Clubs.Layouts migration (docs/coc-mapping/05 §8) has been applied - the
// column does not exist yet, so there is nothing to exercise.
func TestPgRepositoryRolledBack(t *testing.T) {
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
		if !columnExists(ctx, tx, "Clubs", "Layouts") {
			t.Skip(`"Clubs"."Layouts" column not migrated yet (docs/coc-mapping/05 §8)`)
		}
		row, ok, err := dbScanOne(ctx, tx, `SELECT "_id" FROM "Clubs" LIMIT 1`)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no clubs")
		}
		clubID := db.StringField(row, "_id")

		repo := NewPgRepository(tx)
		svc := NewService(repo)

		// A never-saved slot reads as empty and reports ErrNoLayout.
		if _, err := repo.GetLayouts(ctx, clubID); err != nil {
			t.Fatalf("GetLayouts: %v", err)
		}
		if _, _, err := svc.MatchPayload(ctx, clubID, Derby); err != ErrNoLayout {
			t.Fatalf("empty slot err = %v, want ErrNoLayout", err)
		}

		// Save one slot, then read it back through the real JSONB column and
		// confirm the other slots are untouched.
		if err := svc.SaveLayout(ctx, clubID, Home, validGrid(), 1); err != nil {
			t.Fatalf("SaveLayout: %v", err)
		}
		slots, xi, err := svc.MatchPayload(ctx, clubID, Home)
		if err != nil {
			t.Fatalf("MatchPayload: %v", err)
		}
		if len(slots) != Starters || len(xi) != Starters {
			t.Errorf("payload = %d slots / %d ids, want %d/%d", len(slots), len(xi), Starters, Starters)
		}
		if _, _, err := svc.MatchPayload(ctx, clubID, Match); err != ErrNoLayout {
			t.Errorf("Match err = %v, want ErrNoLayout (untouched slot)", err)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back layouts: %v", err)
	}
}

// columnExists reports whether table.column is present in the live schema, so a
// DB test can skip cleanly while its migration is still pending.
func columnExists(ctx context.Context, q db.Querier, table, column string) bool {
	row, ok, err := dbScanOne(ctx, q,
		`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
		table, column)
	if err != nil || !ok {
		return false
	}
	switch n := row["n"].(type) {
	case int:
		return n != 0
	case int64:
		return n != 0
	case float64:
		return n != 0
	default:
		return false
	}
}

func dbScanOne(ctx context.Context, q db.Querier, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}
