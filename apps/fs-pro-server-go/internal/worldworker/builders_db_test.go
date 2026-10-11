package worldworker

import (
	"context"
	"fmt"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

var buildersSeq int64

// TestBuildersTickerJobRolledBack runs the registered builder job against a real
// database inside a always-rolled-back transaction: a due upgrade is promoted
// once, and a second tick promoting nothing proves the guard.
func TestBuildersTickerJobRolledBack(t *testing.T) {
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

	tick := BuildersTicker(func() time.Time { return now })
	if tick.ID != "builders" || tick.LockKey != LockBuilders {
		t.Fatalf("unexpected builder ticker: %+v", tick)
	}

	run := func(tx db.Querier) error {
		code := fmt.Sprintf("WW%d", atomic.AddInt64(&buildersSeq, 1))
		row, err := db.InsertRow(ctx, tx, "Clubs", map[string]any{
			"Name": "Worker " + code, "ClubCode": code, "updatedAt": time.Now(), "ClubhouseTier": 1,
		})
		if err != nil {
			return err
		}
		clubID := db.StringField(row, "_id")
		if _, err := tx.Exec(ctx, `INSERT INTO "ClubAssets" ("ClubId","AssetType","Level","UpgradingTo","StartAt","CompleteAt","updatedAt")
			VALUES ($1,'turnstiles',1,2,$2,$2,now())`, clubID, now.Add(-time.Minute)); err != nil {
			return err
		}

		if err := tick.Job(ctx, tx); err != nil {
			return fmt.Errorf("first tick: %w", err)
		}
		level, upgrading := assetState(t, ctx, tx, clubID)
		if level != 2 || upgrading != 0 {
			return fmt.Errorf("after first tick level=%d upgrading=%d, want 2/0", level, upgrading)
		}

		if err := tick.Job(ctx, tx); err != nil {
			return fmt.Errorf("second tick: %w", err)
		}
		level2, _ := assetState(t, ctx, tx, clubID)
		if level2 != 2 {
			return fmt.Errorf("second tick changed level to %d (double promote)", level2)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back builders tick: %v", err)
	}
}

func assetState(t *testing.T, ctx context.Context, q db.Querier, clubID string) (int, int) {
	t.Helper()
	rows, err := q.Query(ctx, `SELECT "Level","UpgradingTo" FROM "ClubAssets" WHERE "ClubId" = $1 AND "AssetType" = 'turnstiles'`, clubID)
	if err != nil {
		t.Fatalf("query asset: %v", err)
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		t.Fatalf("scan asset: ok=%v err=%v", ok, err)
	}
	return intOf(m["Level"]), intOf(m["UpgradingTo"])
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
	default:
		return 0
	}
}
