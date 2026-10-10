package play

import (
	"context"
	"fmt"
	"net/http"

	"fs-pro-server/internal/grid"
	"fs-pro-server/internal/httpapi"
	"fs-pro-server/internal/league"
	"fs-pro-server/internal/scout"
)

// scoutOpponent is POST /api/play/{clubId}/scout/{oppId}: the read-only scout
// screen. It shows the opponent's Home Grid plus their tier/league and a coarse
// threat read, masked by the caller's Scouting facility. It never returns the
// opponent's player names, attributes or ratings (docs/coc-mapping/03 §1.7,
// 02 §B2).
func (h *Handlers) scoutOpponent(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	ctx := r.Context()
	tiers, err := h.repo.tiers(ctx, r.PathValue("clubId"))
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	grids, clubs := h.scoutDeps()
	report, err := ScoutOpponent(ctx, grids, clubs, r.PathValue("clubId"), r.PathValue("oppId"), intOf(tiers["scoutingTier"]))
	if err != nil {
		return scoutFail(err)
	}
	return httpapi.OK("Scout report", report)
}

// scoutDeps returns the layout store and club reader. Tests inject substitutes;
// otherwise the pgx-backed defaults wrap the match repository's querier.
func (h *Handlers) scoutDeps() (grid.Repository, grid.ClubReader) {
	if h.grids != nil && h.clubs != nil {
		return h.grids, h.clubs
	}
	q := h.repo.Q()
	return grid.NewPgRepository(q), grid.NewPgClubReader(q)
}

// ScoutOpponent builds the masked scout report. It is pure over its injected
// layout store and club reader, so the screen is table-testable without a
// database.
func ScoutOpponent(ctx context.Context, grids grid.Repository, clubs grid.ClubReader, callerID, oppID string, scoutingTier int) (map[string]any, error) {
	if oppID == "" {
		return nil, PrepError{"Pick an opponent to scout", 400}
	}
	if oppID == callerID {
		return nil, PrepError{"You cannot scout your own club", 400}
	}
	profile, ok, err := clubs.Profile(ctx, oppID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, PrepError{"Opponent not found", 404}
	}

	// The layout read is best-effort: until Clubs.Layouts is migrated a club has
	// no Home Grid, and the screen still shows tier/league/masked power.
	var homeGrid any
	var threat any
	if layouts, err := grids.GetLayouts(ctx, oppID); err == nil {
		if g, present := layouts.Grid(grid.Home); present && len(g.Slots) > 0 {
			homeGrid = g
			threat = grid.ThreatReadOf(g)
		}
	}

	band := scout.Mask(int(profile.Rating), scoutingTier)
	notes := []any{}
	if homeGrid == nil {
		notes = append(notes, "They have not set a Home Grid yet.")
	}
	if scoutingTier < 1 {
		notes = append(notes, "Build a Scouting Department to sharpen this read.")
	}

	return map[string]any{
		"opponent": map[string]any{
			"id":    profile.ID,
			"name":  profile.Name,
			"code":  profile.Code,
			"power": power(profile.Rating),
		},
		"tier":          profile.ClubhouseTier,
		"league":        leagueName(league.LeagueFor(profile.StandingPoints)),
		"scoutingLevel": scoutingTier,
		"rating":        map[string]any{"low": band.Low, "high": band.High},
		"homeGrid":      homeGrid,
		"threat":        threat,
		"notes":         notes,
	}, nil
}

// scoutFail maps a scout refusal to its HTTP status, else 400.
func scoutFail(err error) httpapi.Response {
	if pe, ok := err.(PrepError); ok {
		return httpapi.Fail(pe.Status, pe.Message, pe.Message)
	}
	return httpapi.Fail(400, err.Error(), err.Error())
}

// leagueName labels a standing league like "Silver II" (Roman division);
// single-division leagues ("Legend") and "Unranked" use their plain name.
func leagueName(l league.League) string {
	if l.Division <= 0 {
		return l.Name
	}
	roman := []string{"", "I", "II", "III"}
	if l.Division < len(roman) {
		return fmt.Sprintf("%s %s", l.Name, roman[l.Division])
	}
	return l.Name
}
