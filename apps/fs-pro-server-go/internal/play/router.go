package play

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the 11 play.* routes.
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("play.getPlayState", http.MethodGet, "/api/play/{clubId}", []int{200, 404}, h.getPlayState)
	s.Register("play.findOpponents", http.MethodGet, "/api/play/{clubId}/opponents", []int{200, 400, 404}, h.findOpponents)
	s.Register("play.playMatch", http.MethodPost, "/api/play/{clubId}/match", []int{200, 400, 401, 403, 404, 409}, h.playMatch)
	s.Register("play.getInbox", http.MethodGet, "/api/play/{clubId}/inbox", []int{200, 400, 401, 403, 404}, h.getInbox)
	s.Register("play.collectShop", http.MethodPost, "/api/play/{clubId}/shop/collect", []int{200, 400, 401, 403, 404}, h.collectShop)
	s.Register("play.getMatchday", http.MethodGet, "/api/play/{clubId}/matchday", []int{200, 400, 401, 403, 404}, h.getMatchday)
	s.Register("play.bookMatch", http.MethodPost, "/api/play/{clubId}/book", []int{200, 400, 401, 403, 404}, h.bookMatch)
	s.Register("play.getMatchPrep", http.MethodGet, "/api/play/{clubId}/fixtures/{fixtureId}/prep", []int{200, 400, 401, 403, 404}, h.getMatchPrep)
	s.Register("play.saveMatchPlan", http.MethodPut, "/api/play/{clubId}/fixtures/{fixtureId}/plan", []int{200, 400, 401, 403, 404}, h.saveMatchPlan)
	s.Register("play.previewMatchPlan", http.MethodPost, "/api/play/{clubId}/fixtures/{fixtureId}/preview", []int{200, 400, 401, 403, 404}, h.previewMatchPlan)
	s.Register("play.markInboxRead", http.MethodPost, "/api/play/{clubId}/inbox/read", []int{200, 400, 401, 403, 404}, h.markInboxRead)
	s.Register("play.scoutOpponent", http.MethodPost, "/api/play/{clubId}/scout/{oppId}", []int{200, 400, 401, 403, 404}, h.scoutOpponent)
}
