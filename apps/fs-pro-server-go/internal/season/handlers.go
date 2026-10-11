package season

import (
	"net/http"
	"sort"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/fixture"
	"fs-pro-server/internal/httpapi"
)

// Handlers implements the seasons.* routes.
type Handlers struct {
	repo     *Repository
	fixtures *fixture.Repository
}

// New builds the handler set.
func New(repo *Repository, fixtures *fixture.Repository) *Handlers {
	return &Handlers{repo: repo, fixtures: fixtures}
}

func boolParam(v string) (bool, bool) {
	switch v {
	case "true":
		return true, true
	case "false":
		return false, true
	default:
		return false, false
	}
}

// getSeasons is GET /api/seasons.
func (h *Handlers) getSeasons(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	q := r.URL.Query()
	filter := Filter{}
	if v := q.Get("competition"); v != "" {
		filter.CompetitionID, filter.HasCompetition = v, true
	}
	seasons, err := h.repo.FindAll(r.Context(), filter)
	if err != nil {
		return httpapi.Fail(400, "Error fetching Seasons", err.Error())
	}
	if current, ok := boolParam(q.Get("current")); ok && current {
		filtered := seasons[:0]
		for _, s := range seasons {
			status := db.StringField(s, "Status")
			if status == "registration" || status == "running" {
				filtered = append(filtered, s)
			}
		}
		seasons = filtered
	}
	sort.SliceStable(seasons, func(i, j int) bool {
		return db.StringField(seasons[i], "CompetitionCode") < db.StringField(seasons[j], "CompetitionCode")
	})
	return httpapi.OK("Seasons fetched successfully", seasons)
}

// getSeasonFixtures is GET /api/seasons/{id}/fixtures.
func (h *Handlers) getSeasonFixtures(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	fixtures, err := h.fixtures.FindAll(r.Context(), fixture.Filter{SeasonID: r.PathValue("id"), HasSeason: true}, fixture.ReadOptions{})
	if err != nil {
		return httpapi.Fail(400, "Error fetching Season Fixtures", err.Error())
	}
	return httpapi.OK("Seasons Fixtures fetched successfully", fixtures)
}

// getSeason is GET /api/seasons/{id}.
func (h *Handlers) getSeason(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	s, ok, err := h.repo.FindByID(r.Context(), r.PathValue("id"))
	if err != nil {
		return httpapi.Fail(400, "Error fetching Season", err.Error())
	}
	if !ok {
		return httpapi.Fail(404, "Season not found!", nil)
	}
	return httpapi.OK("Season fetched successfully", s)
}

// getSeasonStandings is GET /api/seasons/{id}/standings.
func (h *Handlers) getSeasonStandings(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	id := r.PathValue("id")
	if _, ok, err := h.repo.FindByID(ctx, id); err != nil {
		return httpapi.Fail(400, "Error fetching Season Standings", err.Error())
	} else if !ok {
		return httpapi.Fail(404, "Season not found!", nil)
	}
	standings, err := h.repo.Standings(ctx, id)
	if err != nil {
		return httpapi.Fail(400, "Error fetching Season Standings", err.Error())
	}
	return httpapi.OK("Season Standings fetched successfully", standings)
}

// deleteSeason is DELETE /api/seasons/{id}.
func (h *Handlers) deleteSeason(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	id := r.PathValue("id")
	_, ok, err := h.repo.Delete(r.Context(), id)
	if err != nil {
		return httpapi.Fail(400, "Error deleting Season", err.Error())
	}
	if !ok {
		return httpapi.Fail(400, "Error deleting Season", "Season ["+id+"] does not exist")
	}
	return httpapi.OK("Season deleted successfully", map[string]any{})
}
