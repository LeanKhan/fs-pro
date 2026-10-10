package legacy

import (
	"net/http"
	"testing"

	"fs-pro-server/internal/config"
	"fs-pro-server/internal/httpapi"
)

// TestRegisterPinsLegacyRoutes pins the id/method/path/statuses the
// orchestrator's main.go wiring, the policy table and the @repo/api-contract
// rely on (docs/coc-mapping/05 §3).
func TestRegisterPinsLegacyRoutes(t *testing.T) {
	srv := httpapi.New(httpapi.Deps{Config: config.Config{LogLevel: "error", RateLimitOff: true}})
	Register(srv, New(NewRepository(nil)))

	seen := map[string]httpapi.RouteInfo{}
	for _, r := range srv.Routes() {
		seen[r.ID] = r
	}
	want := []struct {
		id       string
		method   string
		path     string
		statuses []int
	}{
		{"legacy.get", http.MethodGet, "/api/legacy/{clubId}", []int{200, 404}},
		{"legacy.claim", http.MethodPost, "/api/legacy/{clubId}/claim", []int{200, 400, 401, 403, 404, 409}},
		{"honours.list", http.MethodGet, "/api/honours/{clubId}", []int{200, 404}},
	}
	for _, w := range want {
		got, ok := seen[w.id]
		if !ok {
			t.Errorf("%s is not registered", w.id)
			continue
		}
		if got.Method != w.method || got.Path != w.path {
			t.Errorf("%s = %s %s, want %s %s", w.id, got.Method, got.Path, w.method, w.path)
		}
		if len(got.Statuses) != len(w.statuses) {
			t.Errorf("%s statuses = %v, want %v", w.id, got.Statuses, w.statuses)
			continue
		}
		for i, s := range w.statuses {
			if got.Statuses[i] != s {
				t.Errorf("%s status[%d] = %d, want %d", w.id, i, got.Statuses[i], s)
			}
		}
	}
}
