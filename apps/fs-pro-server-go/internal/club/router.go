package club

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the 15 clubs.* routes.
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("clubs.getClubs", http.MethodGet, "/api/clubs/all", []int{200, 400}, h.getClubs)
	s.Register("clubs.getClub", http.MethodGet, "/api/clubs/{id}", []int{200, 404}, h.getClub)
	s.Register("clubs.getClubPerformance", http.MethodGet, "/api/clubs/{id}/performance", []int{200, 404, 400}, h.getClubPerformance)
	s.Register("clubs.suggestLineup", http.MethodPost, "/api/clubs/{id}/lineup-suggestion", []int{200, 404, 400}, h.suggestLineup)
	s.Register("clubs.createClub", http.MethodPost, "/api/clubs/new", []int{200, 400}, h.createClub)
	s.Register("clubs.updateClub", http.MethodPost, "/api/clubs/{id}/update", []int{200, 400}, h.updateClub)
	s.Register("clubs.deleteClub", http.MethodDelete, "/api/clubs/{id}", []int{200, 400}, h.deleteClub)
	s.Register("clubs.addPlayerToClub", http.MethodPut, "/api/clubs/{id}/add-player", []int{200, 400}, h.addPlayerToClub)
	s.Register("clubs.addManyPlayersToClub", http.MethodPut, "/api/clubs/{id}/add-many-players", []int{200, 400}, h.addManyPlayersToClub)
	s.Register("clubs.refreshAllClubsRatings", http.MethodPut, "/api/clubs/refresh-ratings", []int{200, 400}, h.refreshAllClubsRatings)
	s.Register("clubs.hireManager", http.MethodPut, "/api/clubs/{id}/manager", []int{200, 400, 401}, h.hireManager)
	s.Register("clubs.fireManager", http.MethodDelete, "/api/clubs/{id}/manager", []int{200, 400}, h.fireManager)
	s.Register("clubs.recruitYouthPlayers", http.MethodPost, "/api/clubs/{id}/recruit-youth", []int{200, 400}, h.recruitYouthPlayers)
	s.Register("clubs.removePlayerFromClub", http.MethodPut, "/api/clubs/{id}/remove-player", []int{200, 400}, h.removePlayerFromClub)
	s.Register("clubs.getMediaFeed", http.MethodGet, "/api/clubs/{id}/media-feed", []int{200, 400}, h.getMediaFeed)
}
