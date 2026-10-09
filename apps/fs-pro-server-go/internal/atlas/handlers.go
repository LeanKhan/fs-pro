package atlas

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Handlers implements the atlas.* routes.
type Handlers struct {
	repo *Repository
}

// New builds the handler set.
func New(repo *Repository) *Handlers { return &Handlers{repo: repo} }

func stub(what string) httpapi.Response {
	return httpapi.Fail(400, what+" is not available in the Go server yet", nil)
}

// checkName is GET /api/atlas/check.
func (h *Handlers) checkName(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	q := r.URL.Query()
	kind := q.Get("kind")
	name := q.Get("name")
	code := q.Get("code")
	if !ValidKind(kind) {
		return httpapi.Fail(400, "Invalid or missing kind", nil)
	}
	var (
		conflicts []string
		err       error
	)
	if kind == "club" {
		conflicts, err = h.repo.ClubConflicts(r.Context(), name, code)
	} else {
		conflicts, err = h.repo.PlaceConflicts(r.Context(), kind, name, code)
	}
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	return httpapi.OK("Checked", NameAvailability(conflicts))
}

// foundClub is POST /api/atlas/clubs: reproduces the 409 "new places need
// names" gate; the full founding flow is not ported, so a complete request is
// a declared 400.
func (h *Handlers) foundClub(cx *httpapi.Context, _ http.ResponseWriter, _ *http.Request) httpapi.Response {
	body, _ := cx.BodyMap()
	if body == nil {
		body = map[string]any{}
	}
	// A fresh world always opens new places; without a placement service we ask
	// for all three names.
	msg, refuse := FoundingRefusal(true, true, true,
		body["newTown"] != nil, body["newRegion"] != nil, body["newCountry"] != nil)
	if refuse {
		return httpapi.Fail(409, msg, nil)
	}
	return stub("Founding a club")
}

func (h *Handlers) getAtlas() httpapi.Response     { return stub("The atlas") }
func (h *Handlers) getChrome() httpapi.Response    { return stub("Atlas chrome") }
func (h *Handlers) search() httpapi.Response       { return stub("Atlas search") }
func (h *Handlers) getPlacement() httpapi.Response { return stub("Placement") }
func (h *Handlers) listInvites() httpapi.Response  { return stub("Town invites") }
func (h *Handlers) createInvite() httpapi.Response { return stub("Creating an invite") }
func (h *Handlers) foundCountry() httpapi.Response { return stub("Founding a country") }
func (h *Handlers) foundTown() httpapi.Response    { return stub("Founding a town") }
