package award

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the awards.* route.
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("awards.getSeasonAwards", http.MethodGet, "/api/awards/season/{season_id}", []int{200, 400}, h.getSeasonAwards)
}
