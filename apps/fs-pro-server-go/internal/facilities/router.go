package facilities

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the 6 facilities.* routes.
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("facilities.getCampus", http.MethodGet, "/api/facilities/{clubId}", []int{200, 404}, h.getCampus)
	s.Register("facilities.startUpgrade", http.MethodPost, "/api/facilities/{clubId}/upgrade", []int{200, 400, 401, 403, 404}, h.startUpgrade)
	s.Register("facilities.savePlacement", http.MethodPut, "/api/facilities/{clubId}/placement", []int{200, 400, 401, 403, 404}, h.savePlacement)
	s.Register("facilities.getMedicalStatus", http.MethodGet, "/api/facilities/{clubId}/medical", []int{200, 404}, h.getMedicalStatus)
	s.Register("facilities.squadRecovery", http.MethodPost, "/api/facilities/{clubId}/medical/squad-recovery", []int{200, 400, 401, 403, 404}, h.squadRecovery)
	s.Register("facilities.treatPlayer", http.MethodPost, "/api/facilities/{clubId}/medical/treat-player", []int{200, 400, 401, 403, 404}, h.treatPlayer)
}
