package abilities

import (
	"net/http"
	"testing"

	"fs-pro-server/internal/config"
	"fs-pro-server/internal/httpapi"
)

// TestRegisterPinsAbilityRoutes pins the id/method/path/statuses the
// orchestrator's main.go wiring and the policy table rely on (05 §3, 08 §2).
func TestRegisterPinsAbilityRoutes(t *testing.T) {
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
		{"abilities.list", http.MethodGet, "/api/clubs/{id}/abilities", []int{200, 404}},
		{"abilities.slot", http.MethodPost, "/api/clubs/{id}/players/{pid}/abilities", []int{200, 400, 401, 403, 404, 409}},
		{"traits.list", http.MethodGet, "/api/traits", []int{200}},
		{"traits.equip", http.MethodPost, "/api/clubs/{id}/players/{pid}/traits", []int{200, 400, 401, 403, 404, 409}},
		{"orders.inventory", http.MethodGet, "/api/clubs/{id}/orders", []int{200, 404}},
		{"orders.prepare", http.MethodPost, "/api/clubs/{id}/orders", []int{200, 400, 401, 403, 404, 409}},
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
	for _, id := range []string{"abilities.list", "abilities.slot", "traits.list", "traits.equip", "orders.inventory", "orders.prepare"} {
		if _, ok := seen[id]; !ok {
			t.Errorf("registered route %s missing", id)
		}
	}
}
