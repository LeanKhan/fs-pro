package seasonpass

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the season.* routes (docs/coc-mapping/05 §3, 04 §6). Every route
// uses a Club rule on the {clubId} path param (see internal/policy/rules.go), so
// the guard enforces ownership and the declared 401/403/404 statuses.
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("season.get", http.MethodGet, "/api/season/{clubId}", []int{200, 404}, h.get)
	s.Register("season.claimObjective", http.MethodPost, "/api/season/{clubId}/objective/{objectiveId}/claim", []int{200, 400, 401, 403, 404, 409}, h.claimObjective)
	s.Register("season.claimPass", http.MethodPost, "/api/season/{clubId}/pass/claim", []int{200, 400, 401, 403, 404, 409}, h.claimPass)
	s.Register("season.claimBank", http.MethodPost, "/api/season/{clubId}/bank/claim", []int{200, 400, 401, 403, 404, 409}, h.claimBank)
}
