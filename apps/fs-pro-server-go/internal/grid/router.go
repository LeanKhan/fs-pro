package grid

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the six grid.* routes. The ids, methods, paths and statuses
// are fixed by the @repo/api-contract grid routes; the matching internal/policy
// entries are owned by the orchestrator's P0 wave.
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("grid.getLayouts", http.MethodGet, "/api/clubs/{id}/layouts", []int{200, 404}, h.getLayouts)
	s.Register("grid.getLayout", http.MethodGet, "/api/clubs/{id}/layouts/{slot}", []int{200, 400, 404}, h.getLayout)
	s.Register("grid.putLayout", http.MethodPut, "/api/clubs/{id}/layouts/{slot}", []int{200, 400, 401, 403, 404}, h.putLayout)
	s.Register("grid.validateLayout", http.MethodPost, "/api/clubs/{id}/layouts/validate", []int{200, 400, 404}, h.validateLayout)
	s.Register("grid.publishLayout", http.MethodPost, "/api/clubs/{id}/layouts/{slot}/publish", []int{200, 400, 401, 403, 404}, h.publishLayout)
	s.Register("grid.importLayout", http.MethodPost, "/api/layouts/import", []int{200, 400, 401, 404}, h.importLayout)
}
