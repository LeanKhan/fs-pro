package seasonpass

import (
	"sync"

	"fs-pro-server/internal/metrics"
)

// Season observability metrics (docs/coc-mapping/05 §9, 06 KPIs). Every season
// claim attempt is counted by kind, and failures are split out so an ops alert
// can watch the error rate without scraping the logs.
var seasonClaimCounters sync.Map // kind -> *metrics.Counter
var seasonClaimErrorCounters sync.Map

// Premium-spend telemetry (OW-I04). This is the observable premium seam: there
// is no payment provider in scope, so "conversion" cannot be measured, but the
// Sponsor-Credit spend volume is a cheap proxy for premium activity.
var (
	sponsorSpendsTotal = metrics.Default().Counter(
		"fspro_sponsor_spends_total",
		"Sponsored-credit spends through the premium seam (04 §9).")
	sponsorCreditsSpentTotal = metrics.Default().Counter(
		"fspro_sponsor_credits_spent_total",
		"Sponsored credits spent through the premium seam (04 §9).")
)

// recordSeasonClaim counts a successful season claim.
func recordSeasonClaim(kind string) { seasonClaimCounter(kind).Inc() }

// recordSeasonClaimError counts a failed season claim.
func recordSeasonClaimError(kind string) { seasonClaimErrorCounter(kind).Inc() }

func seasonClaimCounter(kind string) *metrics.Counter {
	if v, ok := seasonClaimCounters.Load(kind); ok {
		return v.(*metrics.Counter)
	}
	c := metrics.Default().CounterLabel(
		"fspro_season_claims_total",
		"Successful season claims, by kind (objective|pass|bank).", "claim", kind)
	actual, _ := seasonClaimCounters.LoadOrStore(kind, c)
	return actual.(*metrics.Counter)
}

func seasonClaimErrorCounter(kind string) *metrics.Counter {
	if v, ok := seasonClaimErrorCounters.Load(kind); ok {
		return v.(*metrics.Counter)
	}
	c := metrics.Default().CounterLabel(
		"fspro_season_claim_errors_total",
		"Failed season claims, by kind (objective|pass|bank).", "claim", kind)
	actual, _ := seasonClaimErrorCounters.LoadOrStore(kind, c)
	return actual.(*metrics.Counter)
}
