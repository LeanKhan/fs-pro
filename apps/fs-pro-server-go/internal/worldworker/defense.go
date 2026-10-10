package worldworker

import (
	"context"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/play"
)

// DefensesInterval is how often the defense sweep runs (05 §4, "Defense
// resolution: event/queue").
const DefensesInterval = 5 * time.Second

// DefenseResolutionTicker resolves queued raids. A raid is normally resolved
// inline by the attacker's request (internal/play.PlayMatch); this sweep is the
// durable offline-defense path: a raid left pending (a crash between queue and
// resolve, or a deferred/async producer) is simulated against the defender's
// stored Home Grid snapshot and its effects applied. It is idempotent - every
// effect is anchored by the once-only RaidResults row - so a crashed-and-retried
// tick cannot double-apply (05 §4).
//
// `sim` is the match runner; nil uses the production sim-service client. Tests
// inject a deterministic fake.
func DefenseResolutionTicker(now func() time.Time, sim play.Simulator) Ticker {
	if now == nil {
		now = time.Now
	}
	return Ticker{
		ID:       "defenses",
		Interval: DefensesInterval,
		LockKey:  LockDefenses,
		Job: func(ctx context.Context, tx db.Querier) error {
			_, err := play.ResolvePendingRaids(ctx, tx, now().UTC(), sim, play.DefaultDefenseBatch)
			return err
		},
	}
}
