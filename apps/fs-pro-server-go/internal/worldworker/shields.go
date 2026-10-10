package worldworker

import (
	"context"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/play"
)

// ShieldsInterval is how often the Rest Window / Warm-up Guard sweep runs
// (05 §4, "Shields 30 s").
const ShieldsInterval = 30 * time.Second

// ShieldsTicker expires lapsed Rest Windows and hands the club its Warm-up
// Guard (04 §5.2, §12). It is idempotent: the shield is cleared as the guard is
// set, so a second tick changes nothing.
func ShieldsTicker(now func() time.Time) Ticker {
	if now == nil {
		now = time.Now
	}
	return Ticker{
		ID:       "shields",
		Interval: ShieldsInterval,
		LockKey:  LockShields,
		Job: func(ctx context.Context, tx db.Querier) error {
			_, err := play.ExpireShields(ctx, tx, now().UTC())
			return err
		},
	}
}
