package atlas

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the 10 atlas.* routes. Policy: getChrome/search public,
// foundClub signedIn, foundCountry/foundTown admin, getPlacement signedIn,
// listInvites/createInvite handler (see policy.Table).
func Register(s *httpapi.Server, h *Handlers) {
	writeErrors := []int{200, 400, 401, 403, 404, 409}
	wrap := func(fn func() httpapi.Response) httpapi.Handler {
		return func(*httpapi.Context, http.ResponseWriter, *http.Request) httpapi.Response { return fn() }
	}
	s.Register("atlas.getAtlas", http.MethodGet, "/api/atlas", []int{200, 400}, wrap(h.getAtlas))
	s.Register("atlas.getChrome", http.MethodGet, "/api/atlas/chrome", []int{200, 400}, wrap(h.getChrome))
	s.Register("atlas.search", http.MethodGet, "/api/atlas/search", []int{200, 400}, wrap(h.search))
	s.Register("atlas.getPlacement", http.MethodGet, "/api/atlas/placement", []int{200, 400, 401}, wrap(h.getPlacement))
	s.Register("atlas.listInvites", http.MethodGet, "/api/atlas/invites", writeErrors, wrap(h.listInvites))
	s.Register("atlas.createInvite", http.MethodPost, "/api/atlas/invites", writeErrors, wrap(h.createInvite))
	s.Register("atlas.checkName", http.MethodGet, "/api/atlas/check", []int{200, 400}, h.checkName)
	s.Register("atlas.foundCountry", http.MethodPost, "/api/atlas/countries", writeErrors, wrap(h.foundCountry))
	s.Register("atlas.foundTown", http.MethodPost, "/api/atlas/towns", writeErrors, wrap(h.foundTown))
	s.Register("atlas.foundClub", http.MethodPost, "/api/atlas/clubs", writeErrors, h.foundClub)
}
