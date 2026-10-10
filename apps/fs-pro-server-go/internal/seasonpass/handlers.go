package seasonpass

import (
	"errors"
	"net/http"
	"time"

	"fs-pro-server/internal/httpapi"
)

// Handlers implements the season.* routes (docs/coc-mapping/05 §3, 04 §6). The
// club id is the {clubId} path param and the route-policy table enforces owner/
// admin access; the season key is an optional `?season=YYYY-MM` query that
// defaults to the current real-time month (04 §12).
type Handlers struct {
	repo *Repository
}

// New builds the handler set.
func New(repo *Repository) *Handlers { return &Handlers{repo: repo} }

func body(cx *httpapi.Context) map[string]any {
	m, _ := cx.BodyMap()
	if m == nil {
		return map[string]any{}
	}
	return m
}

func str(m map[string]any, key string) string {
	s, _ := m[key].(string)
	return s
}

// seasonKey resolves the season: an explicit valid `?season=`, else the current
// month (or the just-ended month for the bank claim, which is the only
// claimable one). ok is false when an explicit key is malformed.
func seasonKey(r *http.Request, now time.Time, previousIfEmpty bool) (string, bool) {
	if q := r.URL.Query().Get("season"); q != "" {
		if _, err := ParseSeasonKey(q); err != nil {
			return "", false
		}
		return q, true
	}
	if previousIfEmpty {
		return SeasonKeyFor(now.AddDate(0, -1, 0)), true
	}
	return SeasonKeyFor(now), true
}

// get is GET /api/season/{clubId}.
func (h *Handlers) get(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	now := time.Now().UTC()
	key, ok := seasonKey(r, now, false)
	if !ok {
		// season.get declares only 200/404, so a malformed query falls back to
		// the current month rather than returning an undeclared 400.
		key = SeasonKeyFor(now)
	}
	payload, found, err := h.repo.BuildSeason(r.Context(), r.PathValue("clubId"), key, now)
	if err != nil {
		return mapErr(err)
	}
	if !found {
		return httpapi.Fail(404, "Club not found", nil)
	}
	return httpapi.OK("Season", payload)
}

// claimObjective is POST /api/season/{clubId}/objective/{objectiveId}/claim.
func (h *Handlers) claimObjective(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	objectiveID := r.PathValue("objectiveId")
	if objectiveID == "" {
		return httpapi.Fail(400, "objectiveId is required", "objectiveId is required")
	}
	now := time.Now().UTC()
	key, ok := seasonKey(r, now, false)
	if !ok {
		return httpapi.Fail(400, "invalid season key", "invalid season key")
	}
	payload, err := h.repo.ClaimObjective(r.Context(), r.PathValue("clubId"), key, objectiveID, now)
	if err != nil {
		return mapErr(err)
	}
	return httpapi.OK("Objective claimed", payload)
}

// claimPass is POST /api/season/{clubId}/pass/claim.
func (h *Handlers) claimPass(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	track := Track(str(body(cx), "track"))
	if track != Silver && track != Gold {
		return httpapi.Fail(400, "track must be 'silver' or 'gold'", "track must be 'silver' or 'gold'")
	}
	now := time.Now().UTC()
	key, ok := seasonKey(r, now, false)
	if !ok {
		return httpapi.Fail(400, "invalid season key", "invalid season key")
	}
	payload, err := h.repo.ClaimPass(r.Context(), r.PathValue("clubId"), key, track, now)
	if err != nil {
		return mapErr(err)
	}
	return httpapi.OK("Season reward claimed", payload)
}

// claimBank is POST /api/season/{clubId}/bank/claim.
func (h *Handlers) claimBank(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	now := time.Now().UTC()
	key, ok := seasonKey(r, now, true)
	if !ok {
		return httpapi.Fail(400, "invalid season key", "invalid season key")
	}
	payload, err := h.repo.ClaimBank(r.Context(), r.PathValue("clubId"), key, now)
	if err != nil {
		return mapErr(err)
	}
	return httpapi.OK("Season bank claimed", payload)
}

// mapErr maps the season sentinel errors to the routes' declared statuses.
func mapErr(err error) httpapi.Response {
	msg := err.Error()
	switch {
	case errors.Is(err, ErrClubNotFound), errors.Is(err, ErrObjectiveNotFound):
		return httpapi.Fail(404, msg, msg)
	case errors.Is(err, ErrPassRequired):
		return httpapi.Fail(403, msg, msg)
	case errors.Is(err, ErrObjectiveIncomplete), errors.Is(err, ErrAlreadyClaimed),
		errors.Is(err, ErrNothingToClaim), errors.Is(err, ErrSeasonNotEnded),
		errors.Is(err, ErrInsufficientCredits), errors.Is(err, ErrInsufficientPerks):
		return httpapi.Fail(409, msg, msg)
	default:
		return httpapi.Fail(400, msg, msg)
	}
}
