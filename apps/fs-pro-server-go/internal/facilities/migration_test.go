package facilities

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

// Migration apply/rollback for the OW-H01 housekeeping drop. It lives in
// internal/facilities because this wave owns only internal/facilities and
// internal/loot on the Go side, and the DB test harness is shared. The test
// runs the real 0054 SQL from disk inside a transaction that is always rolled
// back, so the scratch DB is never mutated by the test itself.

// migrationPath resolves apps/fs-pro-server/src/db/drizzle/migrations/<name>
// relative to this test file (apps/fs-pro-server-go/internal/facilities).
func migrationPath(name string) string {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return ""
	}
	return filepath.Join(filepath.Dir(file), "..", "..", "..", "fs-pro-server", "src", "db", "drizzle", "migrations", name)
}

// boardPerksTablePresent reports whether the legacy "BoardPerks" relation is
// committed in the database (case-exact: the table was created quoted).
func boardPerksTablePresent(ctx context.Context, q db.Querier) (bool, error) {
	rows, err := q.Query(ctx, `SELECT EXISTS (
		SELECT 1 FROM pg_class WHERE relname = 'BoardPerks' AND relkind = 'r') AS present`)
	if err != nil {
		return false, err
	}
	row, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return false, err
	}
	present, _ := row["present"].(bool)
	return present, nil
}

// TestDropBoardPerksMigrationRolledBack proves migration 0054 is apply+rollback
// clean: the real SQL drops "BoardPerks" inside a transaction, and the rollback
// restores the pre-test state exactly. The table is (re)created first so the
// test is self-sufficient whether or not 0046 has been applied to the DB.
func TestDropBoardPerksMigrationRolledBack(t *testing.T) {
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

	migration, err := os.ReadFile(migrationPath("0054_drop_board_perks.sql"))
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	if !strings.Contains(string(migration), `DROP TABLE IF EXISTS "BoardPerks"`) {
		t.Fatalf("0054 must drop the BoardPerks table:\n%s", migration)
	}

	before, err := boardPerksTablePresent(ctx, pool)
	if err != nil {
		t.Fatalf("read pre-state: %v", err)
	}

	err = db.InRollback(ctx, pool, func(tx db.Querier) error {
		// Recreate the 0046 shape so the drop has something to act on, even if
		// the chain already applied 0054 to this database.
		if _, err := tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS "BoardPerks" (
			"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
			"ClubId" uuid NOT NULL,
			"Perk" text NOT NULL,
			"Count" integer NOT NULL DEFAULT 0)`); err != nil {
			return err
		}
		present, err := boardPerksTablePresent(ctx, tx)
		if err != nil {
			return err
		}
		if !present {
			t.Fatal("BoardPerks must exist before the drop")
		}
		// Apply the migration verbatim.
		if _, err := tx.Exec(ctx, string(migration)); err != nil {
			return err
		}
		gone, err := boardPerksTablePresent(ctx, tx)
		if err != nil {
			return err
		}
		if gone {
			t.Error("0054 did not drop BoardPerks")
		}
		// Re-applying is idempotent (DROP ... IF EXISTS) and still succeeds.
		if _, err := tx.Exec(ctx, string(migration)); err != nil {
			t.Errorf("re-applying 0054 failed: %v", err)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("rolled-back apply: %v", err)
	}

	after, err := boardPerksTablePresent(ctx, pool)
	if err != nil {
		t.Fatalf("read post-state: %v", err)
	}
	if after != before {
		t.Fatalf("rollback did not restore state: BoardPerks present %v -> %v", before, after)
	}
}
