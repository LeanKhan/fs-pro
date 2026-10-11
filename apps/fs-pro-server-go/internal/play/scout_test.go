package play

import (
	"context"
	"testing"

	"fs-pro-server/internal/grid"
)

// fakeClubReader is an in-memory grid.ClubReader.
type fakeClubReader struct {
	profiles map[string]grid.ClubProfile
}

func (f fakeClubReader) Profile(_ context.Context, id string) (grid.ClubProfile, bool, error) {
	p, ok := f.profiles[id]
	return p, ok, nil
}

func (f fakeClubReader) ClubForUser(context.Context, string) (string, bool, error) {
	return "", false, nil
}

func scoutHomeGrid() grid.Grid {
	return grid.Grid{Slots: []grid.Slot{
		{Col: 0, Row: 3, PlayerID: "gk", Position: grid.GK},
		{Col: 1, Row: 1, PlayerID: "d1", Position: grid.DEF},
		{Col: 1, Row: 3, PlayerID: "d2", Position: grid.DEF},
		{Col: 1, Row: 5, PlayerID: "d3", Position: grid.DEF},
		{Col: 3, Row: 0, PlayerID: "m1", Position: grid.MID},
		{Col: 3, Row: 2, PlayerID: "m2", Position: grid.MID},
		{Col: 3, Row: 4, PlayerID: "m3", Position: grid.MID},
		{Col: 3, Row: 6, PlayerID: "m4", Position: grid.MID},
		{Col: 4, Row: 1, PlayerID: "a1", Position: grid.ATT},
		{Col: 4, Row: 3, PlayerID: "a2", Position: grid.ATT},
		{Col: 4, Row: 5, PlayerID: "a3", Position: grid.ATT},
	}}
}

func newScoutDeps(t *testing.T) (grid.Repository, grid.ClubReader) {
	t.Helper()
	repo := grid.NewMemoryRepository()
	if err := repo.SetLayout(context.Background(), "opp", grid.Home, scoutHomeGrid()); err != nil {
		t.Fatalf("seed layout: %v", err)
	}
	clubs := fakeClubReader{profiles: map[string]grid.ClubProfile{
		"opp": {ID: "opp", Name: "Rivals", Code: "RIV", Rating: 60, ClubhouseTier: 4, StandingPoints: 900},
	}}
	return repo, clubs
}

func TestScoutOpponentShowsHomeGridAndCoarseRead(t *testing.T) {
	repo, clubs := newScoutDeps(t)
	report, err := ScoutOpponent(context.Background(), repo, clubs, "me", "opp", 0)
	if err != nil {
		t.Fatalf("ScoutOpponent: %v", err)
	}

	// The opponent's Home Grid is present, read-only.
	hg, ok := report["homeGrid"].(grid.Grid)
	if !ok || len(hg.Slots) != grid.Starters {
		t.Fatalf("homeGrid = %#v, want %d slots", report["homeGrid"], grid.Starters)
	}

	// Tier/league and a masked power band.
	if report["tier"].(int) != 4 {
		t.Errorf("tier = %v, want 4", report["tier"])
	}
	if report["league"].(string) != "Silver II" {
		t.Errorf("league = %v, want Silver II", report["league"])
	}
	band := report["rating"].(map[string]any)
	if band["low"].(int) != 45 || band["high"].(int) != 75 {
		t.Errorf("masked rating = %#v, want 45..75", band)
	}

	// The coarse threat read is the grid's lane load, and carries no player list.
	threat, ok := report["threat"].(grid.ThreatRead)
	if !ok {
		t.Fatalf("threat = %#v, want a ThreatRead", report["threat"])
	}
	if threat.Lanes[0].Name != "centre" || threat.Lanes[0].Players != 4 {
		t.Errorf("strongest lane = %+v, want centre/4", threat.Lanes[0])
	}
	if _, leaked := report["players"]; leaked {
		t.Error("scout report must never include the opponent's player list")
	}
}

func TestScoutOpponentSharpensWithScouting(t *testing.T) {
	repo, clubs := newScoutDeps(t)
	level0, _ := ScoutOpponent(context.Background(), repo, clubs, "me", "opp", 0)
	level3, _ := ScoutOpponent(context.Background(), repo, clubs, "me", "opp", 3)
	b0 := level0["rating"].(map[string]any)
	b3 := level3["rating"].(map[string]any)
	if b3["high"].(int)-b3["low"].(int) >= b0["high"].(int)-b0["low"].(int) {
		t.Errorf("a better Scouting facility must narrow the band: %#v vs %#v", b3, b0)
	}
}

func TestScoutOpponentRefusals(t *testing.T) {
	repo, clubs := newScoutDeps(t)
	if _, err := ScoutOpponent(context.Background(), repo, clubs, "me", "me", 0); err == nil {
		t.Error("scouting your own club must be refused")
	}
	if _, err := ScoutOpponent(context.Background(), repo, clubs, "me", "ghost", 0); err == nil {
		t.Error("a missing opponent must be refused")
	}
}

func TestScoutOpponentWithoutHomeGrid(t *testing.T) {
	repo := grid.NewMemoryRepository() // nothing saved
	clubs := fakeClubReader{profiles: map[string]grid.ClubProfile{
		"opp": {ID: "opp", Name: "Rivals", ClubhouseTier: 1},
	}}
	report, err := ScoutOpponent(context.Background(), repo, clubs, "me", "opp", 0)
	if err != nil {
		t.Fatalf("ScoutOpponent: %v", err)
	}
	if report["homeGrid"] != nil || report["threat"] != nil {
		t.Errorf("no Home Grid should yield null grid/threat, got %#v/%#v", report["homeGrid"], report["threat"])
	}
	if report["league"].(string) != "Unranked" {
		t.Errorf("league = %v, want Unranked", report["league"])
	}
}
