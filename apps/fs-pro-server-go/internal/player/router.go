package player

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the 8 players.* routes.
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("players.getPlayers", http.MethodGet, "/api/players/all", []int{200, 400}, h.getPlayers)
	s.Register("players.updatePlayer", http.MethodPost, "/api/players/{id}/update", []int{200, 400}, h.updatePlayer)
	s.Register("players.createPlayer", http.MethodPost, "/api/players/new", []int{200, 400}, h.createPlayer)
	s.Register("players.getPlayerRating", http.MethodGet, "/api/players/{id}/rating", []int{200, 400}, h.getPlayerRating)
	s.Register("players.getPlayerStats", http.MethodGet, "/api/players/stats", []int{200, 400}, h.getPlayerStats)
	s.Register("players.generatePlayers", http.MethodGet, "/api/players/generate-players", []int{200, 400}, h.generatePlayers)
	s.Register("players.getPlayer", http.MethodGet, "/api/players/{id}", []int{200, 400}, h.getPlayer)
	s.Register("players.deletePlayer", http.MethodDelete, "/api/players/{id}", []int{200, 400}, h.deletePlayer)
}
