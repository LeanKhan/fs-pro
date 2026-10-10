package worldworker

import (
	"context"
	"time"

	"fs-pro-server/internal/campus"
	"fs-pro-server/internal/db"
)

// BuildersInterval is how often the builder sweep runs (05 §4, "Builders 5 s").
const BuildersInterval = 5 * time.Second

// BuildersTicker is the registered builder sweep: promote every ClubAssets
// upgrade whose CompleteAt has passed. The promotion is a single guarded UPDATE
// (idempotent - a second tick promotes nothing) wrapped in the registry's
// transaction-scoped advisory lock, so several worker instances cannot double
// promote.
func BuildersTicker(now func() time.Time) Ticker {
	if now == nil {
		now = time.Now
	}
	return Ticker{
		ID:       "builders",
		Interval: BuildersInterval,
		LockKey:  LockBuilders,
		Job: func(ctx context.Context, tx db.Querier) error {
			started := time.Now()
			promoted, err := campus.SweepDueUpgrades(ctx, tx, now().UTC())
			buildersSweepSeconds.Observe(time.Since(started).Seconds())
			if err == nil {
				buildersSweeps.Inc()
				if promoted > 0 {
					buildersPromotions.Add(float64(promoted))
				}
			}
			return err
		},
	}
}
