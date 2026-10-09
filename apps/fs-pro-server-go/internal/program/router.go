package program

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the 13 program.* routes.
func Register(s *httpapi.Server, h *Handlers) {
	statuses := []int{200, 400, 401, 403, 404, 409}
	wrap := func(fn func() httpapi.Response) httpapi.Handler {
		return func(*httpapi.Context, http.ResponseWriter, *http.Request) httpapi.Response { return fn() }
	}
	s.Register("program.getProgram", http.MethodGet, "/api/program/{clubId}", statuses, h.getProgram)
	s.Register("program.advanceProgram", http.MethodPost, "/api/program/{clubId}/advance", statuses, h.advanceProgram)
	s.Register("program.dismissTip", http.MethodPost, "/api/program/{clubId}/tips/{tipId}/dismiss", statuses, h.dismissTip)
	s.Register("program.tip", http.MethodPost, "/api/program/{clubId}/tip", statuses, wrap(h.tip))
	s.Register("program.browseManagers", http.MethodGet, "/api/program/{clubId}/managers", statuses, wrap(h.browseManagers))
	s.Register("program.interviewManager", http.MethodPost, "/api/program/{clubId}/managers/{managerId}/interview", statuses, wrap(h.interviewManager))
	s.Register("program.signManager", http.MethodPost, "/api/program/{clubId}/managers/{managerId}/sign", statuses, wrap(h.signManager))
	s.Register("program.releaseManager", http.MethodPost, "/api/program/{clubId}/managers/{managerId}/release", statuses, wrap(h.releaseManager))
	s.Register("program.browsePlayers", http.MethodGet, "/api/program/{clubId}/players", statuses, wrap(h.browsePlayers))
	s.Register("program.scoutPlayer", http.MethodPost, "/api/program/{clubId}/players/{playerId}/scout", statuses, wrap(h.scoutPlayer))
	s.Register("program.signPlayer", http.MethodPost, "/api/program/{clubId}/players/{playerId}/sign", statuses, wrap(h.signPlayer))
	s.Register("program.requestLoan", http.MethodPost, "/api/program/{clubId}/loan", statuses, h.requestLoan)
	s.Register("program.getProgramChapter", http.MethodGet, "/api/program/{clubId}/chapter", statuses, h.getProgramChapter)
}
