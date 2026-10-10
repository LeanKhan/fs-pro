package preseason

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the preseason.* routes (docs/coc-mapping/05 §3, 02 §J, 06 P9).
// All three are owner/admin-scoped on the {clubId} path param by the route-policy
// table (clubParam("clubId") in internal/policy/rules.go).
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("preseason.get", http.MethodGet, "/api/preseason/{clubId}", []int{200, 404}, h.get)
	s.Register("preseason.play", http.MethodPost, "/api/preseason/{clubId}/play", []int{200, 400, 401, 403, 404, 409}, h.play)
	s.Register("preseason.claim", http.MethodPost, "/api/preseason/{clubId}/claim", []int{200, 400, 401, 403, 404, 409}, h.claim)
}
