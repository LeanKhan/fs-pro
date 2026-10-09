package tile

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the single tiles.* route.
func Register(s *httpapi.Server, h *Handlers) {
	s.RegisterRaw("tiles.getTile", http.MethodGet, "/api/tiles/{z}/{x}/{y}", []int{200, 400}, h.getTile)
}
