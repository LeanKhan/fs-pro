package fixture

import (
	"net/http"
	"net/url"
	"strconv"

	"fs-pro-server/internal/httpapi"
)

// Handlers implements the fixtures.* routes.
type Handlers struct {
	repo *Repository
}

// New builds the handler set.
func New(repo *Repository) *Handlers { return &Handlers{repo: repo} }

func boolParam(q url.Values, name string) (value, present bool) {
	vals, ok := q[name]
	if !ok || len(vals) == 0 {
		return false, false
	}
	return vals[0] == "true", true
}

func intParam(q url.Values, name string) (value int, present bool) {
	v := q.Get(name)
	if v == "" {
		return 0, false
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0, false
	}
	return n, true
}

// getFixtures is GET /api/fixtures.
func (h *Handlers) getFixtures(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	q := r.URL.Query()
	f := Filter{}
	if v := q.Get("season"); v != "" {
		f.SeasonID, f.HasSeason = v, true
	}
	if v, ok := boolParam(q, "played"); ok {
		f.Played, f.HasPlayed = v, true
	}
	if v, ok := intParam(q, "scheduledDay"); ok {
		f.ScheduledDay, f.HasScheduledDay = v, true
	}
	if v, ok := intParam(q, "scheduledDayFrom"); ok {
		f.ScheduledFrom, f.HasScheduledFrom = v, true
	}
	if v, ok := intParam(q, "scheduledDayTo"); ok {
		f.ScheduledTo, f.HasScheduledTo = v, true
	}
	if v := q.Get("club"); v != "" {
		f.Club, f.HasClub = v, true
	}
	light, _ := boolParam(q, "light")
	fixtures, err := h.repo.FindAll(r.Context(), f, ReadOptions{Light: light})
	if err != nil {
		return httpapi.Fail(400, "Error fetching Fixtures", err.Error())
	}
	return httpapi.OK("Fixtures fetched successfully", fixtures)
}

// getScheduleSummary is GET /api/fixtures/schedule-summary.
func (h *Handlers) getScheduleSummary(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	summary, err := h.repo.Summary(r.Context())
	if err != nil {
		return httpapi.Fail(400, "Error fetching schedule summary", err.Error())
	}
	return httpapi.OK("Schedule summary fetched successfully", summary)
}

// getFixture is GET /api/fixtures/{id}.
func (h *Handlers) getFixture(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	f, ok, err := h.repo.FindByID(r.Context(), r.PathValue("id"), ReadOptions{WithClub: true})
	if err != nil {
		return httpapi.Fail(400, "Error fetching Fixture", err.Error())
	}
	if !ok {
		return httpapi.OK("Fixture fetched successfully", nil)
	}
	return httpapi.OK("Fixture fetched successfully", f)
}

// deleteFixture is DELETE /api/fixtures/{id}.
func (h *Handlers) deleteFixture(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	id := r.PathValue("id")
	f, ok, err := h.repo.Delete(r.Context(), id)
	if err != nil {
		return httpapi.Fail(400, "Error deleting Fixture", err.Error())
	}
	if !ok {
		return httpapi.Fail(400, "Error deleting Fixture", "Fixture ["+id+"] does not exist")
	}
	return httpapi.OK("Fixture deleted successfully :)", f)
}
