package legacy

import (
	"errors"
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Handlers implements legacy.get / legacy.claim / honours.list (docs/coc-mapping
// 05 §3, 02 §I/§K). The club id is the {clubId} path param and the route-policy
// table enforces owner/admin access.
type Handlers struct {
	repo *Repository
}

// New builds the handler set.
func New(repo *Repository) *Handlers { return &Handlers{repo: repo} }

// get is GET /api/legacy/{clubId}.
func (h *Handlers) get(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	payload, ok, err := h.repo.BuildLegacy(r.Context(), r.PathValue("clubId"))
	if err != nil {
		return mapErr(err)
	}
	if !ok {
		return httpapi.Fail(404, "Club not found", nil)
	}
	return httpapi.OK("Club Legacy", payload)
}

// claim is POST /api/legacy/{clubId}/claim.
func (h *Handlers) claim(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	payload, err := h.repo.ClaimLegacy(r.Context(), r.PathValue("clubId"))
	if err != nil {
		return mapErr(err)
	}
	return httpapi.OK("6th Groundskeeper granted", payload)
}

// honours is GET /api/honours/{clubId}.
func (h *Handlers) honours(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	payload, ok, err := h.repo.BuildHonours(r.Context(), r.PathValue("clubId"))
	if err != nil {
		return mapErr(err)
	}
	if !ok {
		return httpapi.Fail(404, "Club not found", nil)
	}
	return httpapi.OK("Club Honours", payload)
}

// mapErr maps the legacy sentinel errors to the routes' declared statuses.
func mapErr(err error) httpapi.Response {
	msg := err.Error()
	switch {
	case errors.Is(err, ErrClubNotFound), errors.Is(err, ErrUnknownStep), errors.Is(err, ErrUnknownHonour):
		return httpapi.Fail(404, msg, msg)
	case errors.Is(err, ErrChainIncomplete), errors.Is(err, ErrHonourIncomplete):
		return httpapi.Fail(409, msg, msg)
	default:
		return httpapi.Fail(400, msg, msg)
	}
}
