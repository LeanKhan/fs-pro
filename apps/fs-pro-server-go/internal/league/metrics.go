package league

import (
	"sync"

	"fs-pro-server/internal/metrics"
)

// Ladder observability metrics (docs/coc-mapping/05 §9, 04 §11, 06 KPIs). The
// Standing/league distribution is sampled on the cheap standing read rather
// than by scanning every club (which would be an unbounded query); it is a
// read-sampled snapshot, not a full census.
var (
	standingPoints = metrics.Default().HistogramWithBuckets(
		"fspro_standing_points",
		"Standing Points observed on a league.standing read.",
		[]float64{400, 600, 800, 1000, 1400, 1800, 2200, 2600, 3000, 3200, 4000})
)

var leagueReadCounters sync.Map // league code -> *metrics.Counter

// observeStanding records one club's Standing and its league bucket.
func observeStanding(points int, code string) {
	standingPoints.Observe(float64(points))
	leagueReadCounter(code).Inc()
}

func leagueReadCounter(code string) *metrics.Counter {
	if v, ok := leagueReadCounters.Load(code); ok {
		return v.(*metrics.Counter)
	}
	c := metrics.Default().CounterLabel(
		"fspro_league_standing_reads_total",
		"league.standing reads by league code (read-sampled league distribution).",
		"league", code)
	actual, _ := leagueReadCounters.LoadOrStore(code, c)
	return actual.(*metrics.Counter)
}
