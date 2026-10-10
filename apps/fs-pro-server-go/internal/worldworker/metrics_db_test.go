package worldworker

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

var metricsSeq int64

// TestBuildersTickAdvancesMetrics proves the worker instrumentation is wired to
// the real tick path: running one builder tick under the registry increments
// the tick counter, the sweep counter and the promotion counter. It uses the
// always-rolled-back scratch-DB pattern so it leaves no rows.
func TestBuildersTickAdvancesMetrics(t *testing.T) {
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

	beforeSweeps := buildersSweeps.Value()
	beforePromotions := buildersPromotions.Value()
	beforeTicks := tickCounter(tick.ID).Value()

	run := func(tx db.Querier) error {
		code := fmt.Sprintf("WM%04d", atomic.AddInt64(&metricsSeq, 1))
		row, err := db.InsertRow(ctx, tx, "Clubs", map[string]any{
			"Name": "Metrics " + code, "ClubCode": code, "updatedAt": time.Now(), "ClubhouseTier": 1,
		})
		if err != nil {
			return err
		}
		clubID := db.StringField(row, "_id")
		if _, err := tx.Exec(ctx, `INSERT INTO "ClubAssets" ("ClubId","AssetType","Level","UpgradingTo","StartAt","CompleteAt","updatedAt")
			VALUES ($1,'turnstiles',1,2,$2,$2,now())`, clubID, now.Add(-time.Minute)); err != nil {
			return err
		}
		// Run the registered tick through the registry so its per-ticker counter
		// is exercised too (not just the job body).
		reg := NewRegistry(tx, slog.Default())
		reg.tick(ctx, tick)
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back builders tick: %v", err)
	}

	if got := buildersSweeps.Value(); got != beforeSweeps+1 {
		t.Errorf("builders sweeps = %v, want %v", got, beforeSweeps+1)
	}
	if got := buildersPromotions.Value(); got < beforePromotions+1 {
		t.Errorf("builders promotions = %v, want >= %v (the due upgrade must promote)", got, beforePromotions+1)
	}
	if got := tickCounter(tick.ID).Value(); got != beforeTicks+1 {
		t.Errorf("worker ticks{builders} = %v, want %v", got, beforeTicks+1)
	}
}
