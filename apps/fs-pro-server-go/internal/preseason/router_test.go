package preseason

import (
	"net/http"
	"testing"

	"fs-pro-server/internal/config"
	"fs-pro-server/internal/httpapi"
)

// TestRegisterPinsPreseasonRoutes pins the id/method/path/statuses that main.go,
// the policy table and @repo/api-contract rely on (docs/coc-mapping/05 §3).
func TestRegisterPinsPreseasonRoutes(t *testing.T) {
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
		{"preseason.get", http.MethodGet, "/api/preseason/{clubId}", []int{200, 404}},
		{"preseason.play", http.MethodPost, "/api/preseason/{clubId}/play", []int{200, 400, 401, 403, 404, 409}},
		{"preseason.claim", http.MethodPost, "/api/preseason/{clubId}/claim", []int{200, 400, 401, 403, 404, 409}},
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
