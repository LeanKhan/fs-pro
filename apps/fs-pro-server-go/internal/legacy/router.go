package legacy

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the legacy.* / honours.* routes (docs/coc-mapping/05 §3). Every
// route uses a Club rule on the {clubId} path param (see internal/policy/rules.go),
// so the guard enforces ownership and the declared 401/403/404 statuses.
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("legacy.get", http.MethodGet, "/api/legacy/{clubId}", []int{200, 404}, h.get)
	s.Register("legacy.claim", http.MethodPost, "/api/legacy/{clubId}/claim", []int{200, 400, 401, 403, 404, 409}, h.claim)
	s.Register("honours.list", http.MethodGet, "/api/honours/{clubId}", []int{200, 404}, h.honours)
}
