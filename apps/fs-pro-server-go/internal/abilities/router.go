package abilities

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the abilities.*/traits.*/orders.* routes (05 §3, 08 §2). The
// ids, methods, paths and statuses are fixed by the @repo/api-contract
// ability/order routes; the matching internal/policy entries are added by the
// orchestrator (see the returned rule ids: clubParam("id") for the club-scoped
// routes, player("pid") for the player-scoped slot/equip routes).
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("abilities.list", http.MethodGet, "/api/clubs/{id}/abilities", []int{200, 404}, h.list)
	s.Register("abilities.slot", http.MethodPost, "/api/clubs/{id}/players/{pid}/abilities", []int{200, 400, 401, 403, 404, 409}, h.slot)
	s.Register("traits.list", http.MethodGet, "/api/traits", []int{200}, h.traits)
	s.Register("traits.equip", http.MethodPost, "/api/clubs/{id}/players/{pid}/traits", []int{200, 400, 401, 403, 404, 409}, h.equip)
	s.Register("orders.inventory", http.MethodGet, "/api/clubs/{id}/orders", []int{200, 404}, h.orders)
	s.Register("orders.prepare", http.MethodPost, "/api/clubs/{id}/orders", []int{200, 400, 401, 403, 404, 409}, h.prepare)
}
