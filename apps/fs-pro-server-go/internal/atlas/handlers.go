package atlas

import (
	"net/http"
	"strings"

	"fs-pro-server/internal/auth"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
)

func str(m map[string]any, key string) string { return db.StringField(m, key) }

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

// atlasFail maps a founding/invite error like Node's failure().
func atlasFail(err error) httpapi.Response {
	status, message := 400, err.Error()
	switch e := err.(type) {
	case FoundingError:
		status, message = e.Status, e.Message
	case InviteError:
		status, message = e.Status, e.Message
	}
	if status == 403 && strings.Contains(strings.ToLower(message), "logged in") {
		status = 401
	}
	return httpapi.Fail(status, message, nil)
}

// foundClub is POST /api/atlas/clubs (signed in).
func (h *Handlers) foundClub(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	body, _ := cx.BodyMap()
	if body == nil {
		body = map[string]any{}
	}
	founded, err := h.repo.FoundClub(r.Context(), sessionUser(cx), body)
	if err != nil {
		return atlasFail(err)
	}
	return httpapi.OK("Club founded", founded)
}

func sessionUser(cx *httpapi.Context) string {
	if cx != nil && cx.Session != nil {
		return cx.Session.UserID()
	}
	return ""
}

// getAtlas is GET /api/atlas (public; the session, when present, adds `me`).
func (h *Handlers) getAtlas(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	atlas, err := h.repo.GetAtlas(r.Context(), sessionUser(cx), r.URL.Query().Get("countryId"))
	if err != nil {
		return httpapi.Fail(400, err.Error(), nil)
	}
	return httpapi.OK("Atlas", atlas)
}

// getChrome is GET /api/atlas/chrome (public).
func (h *Handlers) getChrome(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	chrome, err := h.repo.GetChrome(r.Context(), sessionUser(cx))
	if err != nil {
		return httpapi.Fail(400, err.Error(), nil)
	}
	return httpapi.OK("Chrome", chrome)
}

// search is GET /api/atlas/search (public).
func (h *Handlers) search(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	results, err := h.repo.Search(r.Context(), r.URL.Query().Get("q"))
	if err != nil {
		return httpapi.Fail(400, err.Error(), nil)
	}
	return httpapi.OK("Results", results)
}

// getPlacement is GET /api/atlas/placement (signed in).
func (h *Handlers) getPlacement(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	placement, err := h.repo.PreviewPlacement(r.Context(), r.URL.Query().Get("invite"))
	if err != nil {
		return atlasFail(err)
	}
	return httpapi.OK("Placement", placement)
}

// listInvites is GET /api/atlas/invites (owner/admin).
func (h *Handlers) listInvites(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	clubID := r.URL.Query().Get("clubId")
	if status, msg := auth.CanManageClub(r.Context(), h.repo.Q(), sessionUser(cx), clubID); status != 0 {
		return httpapi.Fail(status, msg, nil)
	}
	invites, err := h.repo.ListInvites(r.Context(), sessionUser(cx), clubID, true)
	if err != nil {
		return atlasFail(err)
	}
	return httpapi.OK("Invites", invites)
}

// createInvite is POST /api/atlas/invites (owner/admin).
func (h *Handlers) createInvite(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	body, _ := cx.BodyMap()
	if body == nil {
		body = map[string]any{}
	}
	clubID := str(body, "clubId")
	if status, msg := auth.CanManageClub(r.Context(), h.repo.Q(), sessionUser(cx), clubID); status != 0 {
		return httpapi.Fail(status, msg, nil)
	}
	invite, err := h.repo.CreateInvite(r.Context(), sessionUser(cx), clubID, true)
	if err != nil {
		return atlasFail(err)
	}
	return httpapi.OK("Invite created", invite)
}

// foundCountry is POST /api/atlas/countries (admin).
func (h *Handlers) foundCountry(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	body, _ := cx.BodyMap()
	if body == nil {
		body = map[string]any{}
	}
	country, err := h.repo.FoundCountry(r.Context(), sessionUser(cx), body)
	if err != nil {
		return atlasFail(err)
	}
	return httpapi.OK(str(country, "name")+" is founded", country)
}

// foundTown is POST /api/atlas/towns (admin).
func (h *Handlers) foundTown(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	body, _ := cx.BodyMap()
	if body == nil {
		body = map[string]any{}
	}
	town, err := h.repo.FoundTown(r.Context(), sessionUser(cx), body)
	if err != nil {
		return atlasFail(err)
	}
	return httpapi.OK(str(town, "name")+" is founded", town)
}
