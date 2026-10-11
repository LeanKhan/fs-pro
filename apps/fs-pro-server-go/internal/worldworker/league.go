package worldworker

import (
	"context"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/league"
)

// LeagueInterval is how often the ladder rollover runs (05 §4, "League:
// hourly/daily").
const LeagueInterval = time.Hour

// LeagueRolloverTicker settles every closed weekly tournament pool
// (promotion/relegation + Standing reset) and the apex's monthly reset (04
// §4.3). It is idempotent: every Standing change is anchored by a once-only
// StandingResults row, so a repeated tick applies nothing.
func LeagueRolloverTicker(now func() time.Time) Ticker {
	if now == nil {
		now = time.Now
	}
	return Ticker{
		ID:       "league",
		Interval: LeagueInterval,
		LockKey:  LockLeague,
		Job: func(ctx context.Context, tx db.Querier) error {
			started := time.Now()
			report, err := league.Rollover(ctx, tx, now().UTC())
			leagueSeconds.Observe(time.Since(started).Seconds())
			if err == nil {
				leagueRollovers.Inc()
				if settled := report.Weekly + report.Monthly; settled > 0 {
					leagueSettled.Add(float64(settled))
				}
			}
			return err
		},
	}
}
