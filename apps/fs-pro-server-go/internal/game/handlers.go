// Package game implements the game.* routes. tacticOptions and createFriendly
// are real; the sim-core-driven endpoints are declared stubs.
package game

import (
	"net/http"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/fixture"
	"fs-pro-server/internal/httpapi"
)

// Formations/styles mirror match-plan.ts's PLAN_FORMATIONS / STYLE_KEYS.
var (
	Formations = []string{"433", "442", "4231", "352", "343", "532", "541", "4141", "451", "41212"}
	Styles     = []string{"Balanced", "HighPress", "Possession", "LowBlock", "Direct"}
)

// Handlers implements the game.* routes.
type Handlers struct {
	fixtures *fixture.Repository
}

// New builds the handler set.
func New(fixtures *fixture.Repository) *Handlers { return &Handlers{fixtures: fixtures} }

// tacticOptions is GET /api/game/tactic-options.
func (h *Handlers) tacticOptions(_ *httpapi.Context, _ http.ResponseWriter, _ *http.Request) httpapi.Response {
	return httpapi.OK("Tactic options", map[string]any{"formations": Formations, "styles": Styles})
}

// createFriendly is POST /api/game/friendly.
func (h *Handlers) createFriendly(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	body, _ := cx.BodyMap()
	if body == nil {
		body = map[string]any{}
	}
	homeID, _ := body["homeClubId"].(string)
	awayID, _ := body["awayClubId"].(string)
	if homeID == "" || awayID == "" {
		return httpapi.Fail(400, "homeClubId and awayClubId are required", nil)
	}
	home, ok, err := h.fixtures.FindByID(ctx, homeID, fixture.ReadOptions{})
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	if !ok {
		return httpapi.Fail(404, "Home club not found", nil)
	}
	away, ok, err := h.fixtures.FindByID(ctx, awayID, fixture.ReadOptions{})
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	if !ok {
		return httpapi.Fail(404, "Away club not found", nil)
	}
	saveStats := true
	if v, ok := body["saveStats"].(bool); ok {
		saveStats = v
	}
	created, err := h.fixtures.Create(ctx, map[string]any{
		"Title":      db.StringField(home, "Name") + " vs " + db.StringField(away, "Name") + " (Friendly)",
		"Home":       db.StringField(home, "ClubCode"),
		"Away":       db.StringField(away, "ClubCode"),
		"HomeTeamId": homeID,
		"AwayTeamId": awayID,
		"Type":       "friendly",
		"Status":     "friendly",
		"Played":     false,
		"SaveStats":  saveStats,
	})
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	return httpapi.OK("Friendly created", map[string]any{"fixture_id": db.StringField(created, "_id")})
}

// kickoffNew is GET /api/game/kickoff-new/{fixture} (sim-core stub).
func (h *Handlers) kickoffNew(_ *httpapi.Context, _ http.ResponseWriter, _ *http.Request) httpapi.Response {
	return httpapi.Fail(400, "Match simulation is not available in the Go server yet", nil)
}

// enqueueMatch is GET /api/game/enqueue/{fixture} (declared 409 stub).
func (h *Handlers) enqueueMatch(_ *httpapi.Context, _ http.ResponseWriter, _ *http.Request) httpapi.Response {
	return httpapi.Fail(409, "The match queue is not available in the Go server yet", nil)
}

// rewatchMatch is GET /api/game/replay/{fixture} (declared 400 stub).
func (h *Handlers) rewatchMatch(_ *httpapi.Context, _ http.ResponseWriter, _ *http.Request) httpapi.Response {
	return httpapi.Fail(400, "Match replays are not available in the Go server yet", nil)
}

// getReplay is GET /api/game/replay/{fixture}/data (declared 400 stub).
func (h *Handlers) getReplay(_ *httpapi.Context, _ http.ResponseWriter, _ *http.Request) httpapi.Response {
	return httpapi.Fail(400, "Match replays are not available in the Go server yet", nil)
}
