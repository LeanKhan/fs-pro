package grid

import (
	"context"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

// ensureGridSchema applies the additive grid/campus columns and the ClubLayouts
// table inside the test's transaction, so the real pgx read/write path is
// exercised against the live database even before the P0 migration is applied.
// It is transaction-scoped DDL that is always rolled back, so it leaves no
// footprint and is a no-op once 0045/0047 have landed (IF NOT EXISTS).
func ensureGridSchema(ctx context.Context, q db.Querier) error {
	stmts := []string{
		`ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "ClubhouseTier" integer NOT NULL DEFAULT 1`,
		`ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "StandingPoints" integer NOT NULL DEFAULT 0`,
		`ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "Layouts" jsonb`,
		`CREATE TABLE IF NOT EXISTS "ClubLayouts" (
			"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
			"ClubId" uuid NOT NULL REFERENCES "Clubs"("_id"),
			"Slot" text NOT NULL,
			"Code" text NOT NULL UNIQUE,
			"Grid" jsonb NOT NULL DEFAULT '{"slots":[]}'::jsonb,
			"PublishedAt" timestamp(3) NOT NULL DEFAULT now(),
			"createdAt" timestamp(3) NOT NULL DEFAULT now(),
			"updatedAt" timestamp(3) NOT NULL DEFAULT now()
		)`,
	}
	for _, sql := range stmts {
		if _, err := q.Exec(ctx, sql); err != nil {
			return err
		}
	}
	return nil
}

// TestPgRepositoryRolledBack exercises the pgx layout store against a real
// database, inside a transaction that is always rolled back (the pattern used
// across the repo). It is skipped without DATABASE_URL.
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
		if err := ensureGridSchema(ctx, tx); err != nil {
			return err
		}
		clubID, err := ensureTestClub(ctx, tx)
		if err != nil {
			return err
		}

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

// TestPgPublishedLayoutsRolledBack exercises the share-code store against a real
// database, rolled back.
func TestPgPublishedLayoutsRolledBack(t *testing.T) {
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
		if err := ensureGridSchema(ctx, tx); err != nil {
			return err
		}
		clubID, err := ensureTestClub(ctx, tx)
		if err != nil {
			return err
		}

		repo := NewPgRepository(tx)
		svc := NewService(repo)
		if err := svc.SaveLayout(ctx, clubID, Home, validGrid(), 1); err != nil {
			t.Fatalf("SaveLayout: %v", err)
		}
		pub, err := svc.PublishLayout(ctx, clubID, Home)
		if err != nil {
			t.Fatalf("PublishLayout: %v", err)
		}
		if !ValidShareCode(pub.Code) {
			t.Fatalf("bad code %q", pub.Code)
		}

		// A duplicate code is refused by the unique constraint.
		if err := repo.Publish(ctx, pub.Code, clubID, Home, validGrid()); err != ErrShareCodeTaken {
			t.Errorf("duplicate publish err = %v, want ErrShareCodeTaken", err)
		}
		// The code round-trips and can be imported into another slot.
		if _, err := svc.ImportLayout(ctx, pub.Code, clubID, Derby, 1); err != nil {
			t.Fatalf("ImportLayout: %v", err)
		}
		if _, _, err := svc.MatchPayload(ctx, clubID, Derby); err != nil {
			t.Errorf("imported Derby not persisted: %v", err)
		}
		// An unknown code is refused.
		if _, err := svc.ImportLayout(ctx, "FSG-00000000", clubID, Match, 1); err != ErrNoShareCode {
			t.Errorf("unknown code err = %v, want ErrNoShareCode", err)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back published layouts: %v", err)
	}
}

// TestPgClubReaderRolledBack exercises the club profile read the grid/scout
// screens use, rolled back.
func TestPgClubReaderRolledBack(t *testing.T) {
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
		if err := ensureGridSchema(ctx, tx); err != nil {
			return err
		}
		clubID, err := ensureTestClub(ctx, tx)
		if err != nil {
			return err
		}
		profile, found, err := NewPgClubReader(tx).Profile(ctx, clubID)
		if err != nil {
			return err
		}
		if !found {
			t.Fatal("club exists but Profile reported not found")
		}
		if profile.ClubhouseTier < 1 {
			t.Errorf("ClubhouseTier = %d, want >= 1", profile.ClubhouseTier)
		}
		if _, found, err := NewPgClubReader(tx).Profile(ctx, "00000000-0000-0000-0000-000000000000"); err != nil || found {
			t.Errorf("missing club: found=%v err=%v, want false/nil", found, err)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back club reader: %v", err)
	}
}

// firstClubID returns any club id, or ok=false when there are no clubs.
func firstClubID(ctx context.Context, q db.Querier) (string, bool, error) {
	rows, err := q.Query(ctx, `SELECT "_id" FROM "Clubs" LIMIT 1`)
	if err != nil {
		return "", false, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return "", false, err
	}
	return db.StringField(m, "_id"), true, nil
}

// ensureTestClub returns an existing club, or inserts one inside the test's
// transaction (rolled back) so the real pgx read/write path is always exercised
// even on an empty scratch database.
func ensureTestClub(ctx context.Context, q db.Querier) (string, error) {
	if id, ok, err := firstClubID(ctx, q); err != nil || ok {
		return id, err
	}
	rows, err := q.Query(ctx, `INSERT INTO "Clubs" ("Name", "ClubCode", "updatedAt")
		VALUES ('FS-Pro Grid Test FC', 'GRDTST', now()) RETURNING "_id"`)
	if err != nil {
		return "", err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return "", err
	}
	return db.StringField(m, "_id"), nil
}
