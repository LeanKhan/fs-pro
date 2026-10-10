package httpapi

import (
	"net/http"
	"strings"
	"testing"

	"fs-pro-server/internal/config"
	"fs-pro-server/internal/metrics"
)

// TestMetricsEndpoint proves GET /metrics is a raw, unauthenticated route that
// serves the injected registry's Prometheus text exposition. It is not an
// envelope route (no success:true wrapper), like /healthz.
func TestMetricsEndpoint(t *testing.T) {
	reg := metrics.NewRegistry()
	reg.Counter("fspro_test_counter_total", "a test counter").Add(5)
	reg.Gauge("fspro_test_gauge", "a test gauge").Set(2)

	s := New(Deps{Config: config.Config{Port: "3000", LogLevel: "error", RateLimitOff: true}, Metrics: reg})
	rec := get(s, "/metrics")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/plain") {
		t.Fatalf("Content-Type = %q, want text/plain exposition", ct)
	}
	body := rec.Body.String()
	for _, want := range []string{
		"# HELP fspro_test_counter_total a test counter",
		"# TYPE fspro_test_counter_total counter",
		"fspro_test_counter_total 5",
		"# TYPE fspro_test_gauge gauge",
		"fspro_test_gauge 2",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("body missing %q:\n%s", want, body)
		}
	}
	// No envelope: a raw text body, not JSON.
	if strings.Contains(body, `"success"`) {
		t.Fatalf("metrics must not be an envelope response: %s", body)
	}
}

// TestMetricsEndpointDefaultRegistryIsServed proves a server built without an
// explicit registry still serves /metrics (200) from metrics.Default().
func TestMetricsEndpointDefaultRegistryIsServed(t *testing.T) {
	rec := get(newTestServer(false, nil), "/metrics")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}
