// Package game implements the game.* routes. tacticOptions and createFriendly
// are real; the sim-core-driven endpoints are declared stubs.
package game

import (
	"context"
	"net/http"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/fixture"
	"fs-pro-server/internal/httpapi"
	"fs-pro-server/internal/play"
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
	practice, _ := body["practice"].(bool)
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
	fixtureID := db.StringField(created, "_id")
	payload := map[string]any{"fixture_id": fixtureID}
	if practice {
		// A Friendly Challenge (02 §D2): resolve the practice raid now. The raid
		// core suppresses every persistent side-effect, so this only records the
		// result on the fixture and notifies the friend.
		repo := play.NewRepository(h.fixtures.Q())
		ref, err := repo.QueueRaid(ctx, play.RaidRequest{
			AttackerID: homeID, DefenderID: awayID, FixtureID: fixtureID, Practice: true,
		})
		if err != nil {
			return httpapi.Fail(400, err.Error(), err.Error())
		}
		res, err := repo.ResolveRaid(ctx, ref.RaidID)
		if err != nil {
			return httpapi.Fail(400, err.Error(), err.Error())
		}
		payload["result"] = res.Summary()
	}
	return httpapi.OK("Friendly created", payload)
}

func gmapOf(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func gintOf(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	case int32:
		return int(n)
	default:
		return 0
	}
}

// kickoffNew is GET /api/game/kickoff-new/{fixture}: the synchronous fixture
// play, plus the admin-only simulate_rest day loop.
func (h *Handlers) kickoffNew(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	fixtureID := r.PathValue("fixture")
	q := r.URL.Query()
	quickSim := q.Get("quick_sim") == "true"
	simulateRest := q.Get("simulate_rest") == "true"
	sendOther := q.Get("send_other_results") == "true"

	repo := play.NewRepository(h.fixtures.Q())
	main, err := repo.PlayFixture(ctx, fixtureID, quickSim)
	if err != nil {
		return httpapi.Fail(400, "[New] Error Playing Match and updating Standings! ", err.Error())
	}
	payload := any(main)
	if simulateRest {
		match := gmapOf(main["match"])
		if match == nil || match["ScheduledDay"] == nil {
			return httpapi.Fail(400, "Match Day not found!", nil)
		}
		day := gintOf(match["ScheduledDay"])
		rows, err := h.fixtures.Q().Query(ctx, `SELECT "_id" FROM "Fixtures" WHERE "ScheduledDay" = $1 AND "Played" = false ORDER BY "_id"`, day)
		if err != nil {
			return httpapi.Fail(400, "[New] Error Playing Match and updating Standings! ", err.Error())
		}
		list, err := db.ScanAll(rows)
		if err != nil {
			return httpapi.Fail(400, "[New] Error Playing Match and updating Standings! ", err.Error())
		}
		others := []any{}
		for _, fx := range list {
			other, err := repo.PlayFixture(ctx, db.StringField(fx, "_id"), true)
			if err != nil {
				continue
			}
			others = append(others, other)
		}
		if sendOther {
			payload = map[string]any{"main": main, "others": others}
		}
	}
	return httpapi.OK("[New] Match Played successfully!", payload)
}

// enqueueMatch is GET /api/game/enqueue/{fixture} (admin). The Go server has no
// Node-style job runner: it verifies the fixture, runs the match in-process
// (headless, replay kept) and returns the 202 immediately.
func (h *Handlers) enqueueMatch(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	fixtureID := r.PathValue("fixture")
	rows, err := h.fixtures.Q().Query(r.Context(), `SELECT "_id" FROM "Fixtures" WHERE "_id" = $1`, fixtureID)
	if err != nil {
		return httpapi.Fail(400, "Error enqueuing match", err.Error())
	}
	if _, ok, err := db.ScanOne(rows); err != nil {
		return httpapi.Fail(400, "Error enqueuing match", err.Error())
	} else if !ok {
		return httpapi.Fail(404, "Fixture not found", nil)
	}
	repo := play.NewRepository(h.fixtures.Q())
	go func() {
		_, _ = repo.PlayFixture(context.Background(), fixtureID, false)
	}()
	return httpapi.OKStatus(202, "Match enqueued for simulation", map[string]any{"fixture_id": fixtureID})
}

// rewatchMatch is GET /api/game/replay/{fixture} -> 202 when a replay exists.
func (h *Handlers) rewatchMatch(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	replay, err := fetchReplay(r.Context(), h.fixtures.Q(), r.PathValue("fixture"))
	if err != nil {
		return httpapi.Fail(400, "Error fetching match replay", err.Error())
	}
	if replay == nil {
		return httpapi.Fail(404, "No replay saved for this match", nil)
	}
	return httpapi.OKStatus(202, "Match replay started", map[string]any{"fixture_id": r.PathValue("fixture")})
}

// getReplay is GET /api/game/replay/{fixture}/data.
func (h *Handlers) getReplay(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	q := h.fixtures.Q()
	replay, err := fetchReplay(r.Context(), q, r.PathValue("fixture"))
	if err != nil {
		return httpapi.Fail(400, "Error fetching match replay", err.Error())
	}
	if replay == nil {
		return httpapi.Fail(404, "No replay saved for this match", nil)
	}
	names, err := replayPlayerNames(r.Context(), q, replay["Frames"])
	if err != nil {
		return httpapi.Fail(400, "Error fetching match replay", err.Error())
	}
	return httpapi.OK("Match replay", map[string]any{
		"Home": replay["Home"], "Away": replay["Away"], "Details": replay["Details"],
		"Frames": replay["Frames"], "Names": names,
	})
}
