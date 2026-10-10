package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"fs-pro-server/internal/config"
	"fs-pro-server/internal/httpapi"

	// Import the instrumented packages for their init-time metric
	// registration, so this test proves the real operating metrics (not just an
	// injected one) are reachable through GET /metrics.
	_ "fs-pro-server/internal/campus"
	_ "fs-pro-server/internal/league"
	_ "fs-pro-server/internal/play"
	_ "fs-pro-server/internal/realtime"
	_ "fs-pro-server/internal/seasonpass"
)

// TestMetricsEndpointExposesOperatingMetrics registers the default registry
// (the one the server serves) and asserts the operating KPIs from
// docs/coc-mapping/05 §9 / 04 §11 are present.
func TestMetricsEndpointExposesOperatingMetrics(t *testing.T) {
	srv := httpapi.New(httpapi.Deps{Config: config.Config{Port: "3000", LogLevel: "error", RateLimitOff: true}})

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if rec.Code != 200 {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := rec.Body.String()

	for _, name := range []string{
		"fspro_campus_reads_total",
		"fspro_campus_read_duration_seconds",
		"fspro_collector_accrual_lag_seconds",
		"fspro_upgrade_queue_pressure",
		"fspro_raid_attempts_total",
		"fspro_defense_raids_failed_total",
		"fspro_standing_points",
		"fspro_sponsor_spends_total",
		"fspro_realtime_publish_attempts_total",
		"fspro_realtime_publish_failure_total",
	} {
		if !strings.Contains(body, name) {
			t.Fatalf("GET /metrics missing metric %q\n---\n%s", name, body)
		}
	}
}
