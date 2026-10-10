package league

import (
	"errors"
	"net/http"
	"time"

	"fs-pro-server/internal/httpapi"
)

// Handlers implements the league.* routes (docs/coc-mapping/05 §3, 04 §4-§5).
// The {clubId}-scoped reads are owner-scoped by the route-policy table
// (clubParam("clubId")); signup is owner-scoped by a Club rule on its body.
type Handlers struct {
	repo *Repository
	now  func() time.Time
}

// New builds the handler set. The clock is a field so tests can pin it.
func New(repo *Repository) *Handlers { return &Handlers{repo: repo, now: time.Now} }

// WithClock replaces the handler clock (tests).
func (h *Handlers) WithClock(now func() time.Time) *Handlers {
	if now != nil {
		h.now = now
	}
	return h
}

// getStanding is GET /api/league/standing/{clubId}.
func (h *Handlers) getStanding(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	payload, ok, err := h.repo.Standing(r.Context(), r.PathValue("clubId"))
	if err != nil {
		return mapErr(err)
	}
	if !ok {
		return httpapi.Fail(404, "Club not found", nil)
	}
	return httpapi.OK("Standing", payload)
}

// getPool is GET /api/league/pool/{clubId}. 404 when the club has not signed up
// for the current week's tournament yet.
func (h *Handlers) getPool(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	payload, ok, err := h.repo.Pool(r.Context(), r.PathValue("clubId"), h.now().UTC())
	if err != nil {
		return mapErr(err)
	}
	if !ok {
		return httpapi.Fail(404, "Not signed up for this week's ladder", nil)
	}
	return httpapi.OK("Weekly pool", payload)
}

// signup is POST /api/league/signup. The club id comes from the body, so the
// policy table scopes it with clubBody("clubId").
func (h *Handlers) signup(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	body, _ := cx.BodyMap()
	clubID, _ := body["clubId"].(string)
	if clubID == "" {
		return httpapi.Fail(400, "clubId is required", "clubId is required")
	}
	payload, err := h.repo.Signup(r.Context(), clubID, h.now().UTC())
	if err != nil {
		return mapErr(err)
	}
	return httpapi.OK("Signed up for the weekly ladder", payload)
}

// getFormBonus is GET /api/league/form-bonus/{clubId}.
func (h *Handlers) getFormBonus(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	payload, ok, err := h.repo.FormBonusState(r.Context(), r.PathValue("clubId"), h.now().UTC())
	if err != nil {
		return mapErr(err)
	}
	if !ok {
		return httpapi.Fail(404, "Club not found", nil)
	}
	return httpapi.OK("Form Bonus", payload)
}

// mapErr maps the league sentinel errors to the routes' declared statuses.
func mapErr(err error) httpapi.Response {
	msg := err.Error()
	switch {
	case errors.Is(err, ErrClubNotFound), errors.Is(err, ErrNotSignedUp):
		return httpapi.Fail(404, msg, msg)
	case errors.Is(err, ErrNotRanked):
		return httpapi.Fail(409, msg, msg)
	default:
		return httpapi.Fail(400, msg, msg)
	}
}
