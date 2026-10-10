package campus

import (
	"sync"
	"time"

	"fs-pro-server/internal/metrics"
)

// Campus observability metrics (docs/coc-mapping/05 §9, 04 §11). Collected on
// the existing read/write paths; every update is a single atomic op.
var (
	campusReads = metrics.Default().Counter(
		"fspro_campus_reads_total",
		"Campus read projections built (campus.get and every mutation response).")
	campusReadSeconds = metrics.Default().Histogram(
		"fspro_campus_read_duration_seconds",
		"Wall-clock duration of one campus read projection (target p99 < 15ms).")

	collectorAccrualLagSeconds = metrics.Default().Histogram(
		"fspro_collector_accrual_lag_seconds",
		"Time since a collector was last harvested, observed per collector on each campus read.")

	upgradeQueueActive = metrics.Default().Gauge(
		"fspro_upgrade_queue_active",
		"Campus upgrades currently under construction for the club just read.")
	upgradeQueueGroundskeepers = metrics.Default().Gauge(
		"fspro_upgrade_queue_groundskeepers",
		"Groundskeepers (build slots) available to the club just read.")
	upgradeQueuePressure = metrics.Default().Gauge(
		"fspro_upgrade_queue_pressure",
		"Upgrade-queue pressure: active upgrades divided by Groundskeepers (the P1 pacing KPI).")
)

// Labelled counter handles are cached so a write path never re-locks the
// registry after the first observation.
var (
	upgradesQueuedCounters     sync.Map // facility -> *metrics.Counter
	collectorCollectedCounters sync.Map // collector -> *metrics.Counter
)

func recordUpgradeQueued(facility string) {
	upgradesQueuedCounter(facility).Inc()
}

func upgradesQueuedCounter(facility string) *metrics.Counter {
	if v, ok := upgradesQueuedCounters.Load(facility); ok {
		return v.(*metrics.Counter)
	}
	c := metrics.Default().CounterLabel(
		"fspro_upgrades_queued_total",
		"Campus upgrades queued via campus.upgrade, by facility.", "facility", facility)
	actual, _ := upgradesQueuedCounters.LoadOrStore(facility, c)
	return actual.(*metrics.Counter)
}

func recordCollectorCollected(collector string) {
	collectorCollectedCounter(collector).Inc()
}

func collectorCollectedCounter(collector string) *metrics.Counter {
	if v, ok := collectorCollectedCounters.Load(collector); ok {
		return v.(*metrics.Counter)
	}
	c := metrics.Default().CounterLabel(
		"fspro_collector_collections_total",
		"Collector harvests that banked a positive amount, by collector.", "collector", collector)
	actual, _ := collectorCollectedCounters.LoadOrStore(collector, c)
	return actual.(*metrics.Counter)
}

// observeCampusRead records one read projection's latency.
func observeCampusRead(d time.Duration) {
	campusReads.Inc()
	campusReadSeconds.Observe(d.Seconds())
}

// observeAccrualLag records how long a collector has been accruing.
func observeAccrualLag(lag time.Duration) {
	collectorAccrualLagSeconds.Observe(lag.Seconds())
}

// observeQueuePressure records the active-vs-Groundskeepers snapshot.
func observeQueuePressure(active, keepers int) {
	upgradeQueueActive.Set(float64(active))
	upgradeQueueGroundskeepers.Set(float64(keepers))
	if keepers > 0 {
		upgradeQueuePressure.Set(float64(active) / float64(keepers))
	} else {
		upgradeQueuePressure.Set(0)
	}
}
