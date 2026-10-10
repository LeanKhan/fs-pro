package league

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the league.* routes (docs/coc-mapping/05 §3). The three
// {clubId}-scoped reads use a Club rule on the clubId path param; signup uses a
// Club rule on its body's clubId (see internal/policy/rules.go).
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("league.standing", http.MethodGet, "/api/league/standing/{clubId}", []int{200, 404}, h.getStanding)
	s.Register("league.pool", http.MethodGet, "/api/league/pool/{clubId}", []int{200, 404}, h.getPool)
	s.Register("league.signup", http.MethodPost, "/api/league/signup", []int{200, 400, 401, 403, 404, 409}, h.signup)
	s.Register("league.formBonus", http.MethodGet, "/api/league/form-bonus/{clubId}", []int{200, 404}, h.getFormBonus)
}
