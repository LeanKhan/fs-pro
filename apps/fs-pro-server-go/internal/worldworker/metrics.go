package worldworker

import (
	"sync"

	"fs-pro-server/internal/metrics"
)

// Worker observability metrics (docs/coc-mapping/05 §9). The handles are
// resolved once at package init, so a tick only pays for atomic updates.
var (
	buildersSweeps = metrics.Default().Counter(
		"fspro_builders_sweeps_total",
		"Builder-sweep jobs that ran to completion (registrar work executed under the lock).")
	buildersPromotions = metrics.Default().Counter(
		"fspro_builders_promotions_total",
		"Campus upgrades promoted to their target level by the builder sweep.")
	buildersSweepSeconds = metrics.Default().Histogram(
		"fspro_builders_sweep_duration_seconds",
		"Wall-clock duration of one builder-sweep job.")

	defenseBatches = metrics.Default().Counter(
		"fspro_defense_batches_total",
		"Offline defense-resolution batches attempted by the worker.")
	defenseBatchErrors = metrics.Default().Counter(
		"fspro_defense_batch_errors_total",
		"Offline defense-resolution batches that returned an error.")
	defenseResolved = metrics.Default().Counter(
		"fspro_defense_raids_resolved_total",
		"Pending raids resolved by the offline defense worker.")
	defenseSeconds = metrics.Default().Histogram(
		"fspro_defense_resolve_duration_seconds",
		"Wall-clock duration of one offline defense-resolution batch.")
	defensePerSecond = metrics.Default().Gauge(
		"fspro_defense_resolved_per_second",
		"Raids resolved per second over the most recent defense-resolution batch.")

	leagueRollovers = metrics.Default().Counter(
		"fspro_league_rollovers_total",
		"Weekly ladder rollover jobs that ran to completion.")
	leagueSettled = metrics.Default().Counter(
		"fspro_league_clubs_settled_total",
		"Clubs whose Standing was settled by the ladder rollover.")
	leagueSeconds = metrics.Default().Histogram(
		"fspro_league_rollover_duration_seconds",
		"Wall-clock duration of one ladder-rollover job.")
)

// Per-ticker tick/error counters are cached (a sync.Map, so the hot path stays
// lock-free after the first tick) because the ticker id is the label value.
var (
	tickCounters      sync.Map // string -> *metrics.Counter
	tickErrorCounters sync.Map // string -> *metrics.Counter
)

func tickCounter(id string) *metrics.Counter {
	if v, ok := tickCounters.Load(id); ok {
		return v.(*metrics.Counter)
	}
	c := metrics.Default().CounterLabel(
		"fspro_worker_ticks_total",
		"World-worker ticker jobs executed (lock acquired).", "ticker", id)
	actual, _ := tickCounters.LoadOrStore(id, c)
	return actual.(*metrics.Counter)
}

func tickErrorCounter(id string) *metrics.Counter {
	if v, ok := tickErrorCounters.Load(id); ok {
		return v.(*metrics.Counter)
	}
	c := metrics.Default().CounterLabel(
		"fspro_worker_tick_errors_total",
		"World-worker ticker jobs that returned an error.", "ticker", id)
	actual, _ := tickErrorCounters.LoadOrStore(id, c)
	return actual.(*metrics.Counter)
}
