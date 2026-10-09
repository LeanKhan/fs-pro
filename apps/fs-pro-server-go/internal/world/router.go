package world

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the 5 world.* routes.
func Register(s *httpapi.Server, h *Handlers) {
	wrap := func(fn func() httpapi.Response) httpapi.Handler {
		return func(*httpapi.Context, http.ResponseWriter, *http.Request) httpapi.Response { return fn() }
	}
	s.Register("world.getSettings", http.MethodGet, "/api/world/settings", []int{200, 400}, h.getSettings)
	s.Register("world.updateSettings", http.MethodPatch, "/api/world/settings", []int{200, 400, 401, 403, 404}, h.updateSettings)
	s.Register("world.endYear", http.MethodPost, "/api/world/end-year", []int{200, 400, 401, 403, 404, 409}, wrap(h.endYear))
	s.Register("world.advanceDay", http.MethodPost, "/api/world/advance-day", []int{200, 400, 401, 403, 404}, wrap(h.advanceDay))
	s.Register("world.performance", http.MethodGet, "/api/world/performance/{clubId}", []int{200, 400, 404}, wrap(h.performance))
}
