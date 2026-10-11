package season

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the 5 seasons.* routes.
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("seasons.getSeasons", http.MethodGet, "/api/seasons", []int{200, 400}, h.getSeasons)
	s.Register("seasons.getSeasonFixtures", http.MethodGet, "/api/seasons/{id}/fixtures", []int{200, 400}, h.getSeasonFixtures)
	s.Register("seasons.getSeason", http.MethodGet, "/api/seasons/{id}", []int{200, 400, 404}, h.getSeason)
	s.Register("seasons.getSeasonStandings", http.MethodGet, "/api/seasons/{id}/standings", []int{200, 400, 404}, h.getSeasonStandings)
	s.Register("seasons.deleteSeason", http.MethodDelete, "/api/seasons/{id}", []int{200, 400, 404}, h.deleteSeason)
}
