package realtime

import "fs-pro-server/internal/metrics"

// Realtime publish observability (docs/coc-mapping/05 §9, OW-F04). A publish is
// fire-and-forget, so before this the only signal was a rate-limited log; these
// counters make gateway health and publish latency visible in /metrics.
var (
	publishAttempts = metrics.Default().Counter(
		"fspro_realtime_publish_attempts_total",
		"Signed realtime gateway publish POSTs handed to the background sender.")
	publishSuccess = metrics.Default().Counter(
		"fspro_realtime_publish_success_total",
		"Realtime gateway publishes that returned a 2xx.")
	publishFailure = metrics.Default().Counter(
		"fspro_realtime_publish_failure_total",
		"Realtime gateway publishes that failed (transport error or non-2xx).")
	publishDropped = metrics.Default().Counter(
		"fspro_realtime_publish_dropped_total",
		"Realtime publishes dropped before sending (invalid event/topic).")
	publishSeconds = metrics.Default().Histogram(
		"fspro_realtime_publish_duration_seconds",
		"Wall-clock duration of one realtime gateway publish POST.")
)
