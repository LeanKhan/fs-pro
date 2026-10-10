package campus

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the campus.* routes (docs/coc-mapping/05 §3). Every route uses
// a Club rule on the clubId path param (see internal/policy/rules.go), so the
// guard enforces ownership and the declared 401/403/404 statuses.
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("campus.get", http.MethodGet, "/api/campus/{clubId}", []int{200, 404}, h.get)
	s.Register("campus.upgrade", http.MethodPost, "/api/campus/{clubId}/upgrade", []int{200, 400, 401, 403, 404, 409}, h.upgrade)
	s.Register("campus.place", http.MethodPost, "/api/campus/{clubId}/place", []int{200, 400, 401, 403, 404}, h.place)
	s.Register("campus.collect", http.MethodPost, "/api/campus/{clubId}/collect", []int{200, 400, 401, 403, 404, 409}, h.collect)
	s.Register("campus.clearObstacle", http.MethodPost, "/api/campus/{clubId}/obstacle/clear", []int{200, 400, 401, 403, 404, 409}, h.clearObstacle)
	s.Register("campus.buyGroundskeeper", http.MethodPost, "/api/campus/{clubId}/groundskeeper/buy", []int{200, 400, 401, 403, 404, 409}, h.buyGroundskeeper)
	s.Register("campus.usePerk", http.MethodPost, "/api/campus/{clubId}/perk/use", []int{200, 400, 401, 403, 404, 409}, h.usePerk)
}
