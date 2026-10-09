package game

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the 6 game.* routes.
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("game.kickoffNew", http.MethodGet, "/api/game/kickoff-new/{fixture}", []int{200, 400}, h.kickoffNew)
	s.Register("game.enqueueMatch", http.MethodGet, "/api/game/enqueue/{fixture}", []int{202, 404, 409}, h.enqueueMatch)
	s.Register("game.rewatchMatch", http.MethodGet, "/api/game/replay/{fixture}", []int{202, 400, 404}, h.rewatchMatch)
	s.Register("game.getReplay", http.MethodGet, "/api/game/replay/{fixture}/data", []int{200, 400, 404}, h.getReplay)
	s.Register("game.tacticOptions", http.MethodGet, "/api/game/tactic-options", []int{200}, h.tacticOptions)
	s.Register("game.createFriendly", http.MethodPost, "/api/game/friendly", []int{200, 400, 404}, h.createFriendly)
}
