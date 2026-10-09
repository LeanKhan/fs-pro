package manager

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the 6 managers.* routes.
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("managers.getManagers", http.MethodGet, "/api/managers", []int{200, 400}, h.getManagers)
	s.Register("managers.getUnemployedManagers", http.MethodGet, "/api/managers/unemployed", []int{200, 400}, h.getUnemployedManagers)
	s.Register("managers.getManager", http.MethodGet, "/api/managers/{id}", []int{200, 400}, h.getManager)
	s.Register("managers.deleteManager", http.MethodDelete, "/api/managers/{id}", []int{200, 400}, h.deleteManager)
	s.Register("managers.updateManager", http.MethodPut, "/api/managers/{id}", []int{200, 400}, h.updateManager)
	s.Register("managers.createManager", http.MethodPost, "/api/managers", []int{200, 400}, h.createManager)
}
