package play

import (
	"testing"
	"time"

	"fs-pro-server/internal/league"
)

func TestDestructionPct(t *testing.T) {
	cases := []struct {
		dominance float64
		want      int
	}{
		{-1, 0},
		{0, 0},
		{0.304, 30},
		{0.5, 50},
		{0.999, 100},
		{1, 100},
		{2, 100},
	}
	for _, c := range cases {
		if got := destructionPct(c.dominance); got != c.want {
			t.Errorf("destructionPct(%v) = %d, want %d", c.dominance, got, c.want)
		}
	}
}

func TestDominanceFromDetails(t *testing.T) {
	// Even sides → neutral 0.5.
	symmetric := map[string]any{
		"HomeTeamDetails": map[string]any{"Possession": 50.0, "XG": 1.0},
		"AwayTeamDetails": map[string]any{"Possession": 50.0, "XG": 1.0},
	}
	if got := dominanceFromDetails(symmetric); got != 0.5 {
		t.Errorf("symmetric dominance = %v, want 0.5", got)
	}
	// Home dominant → > 0.5.
	home := map[string]any{
		"HomeTeamDetails": map[string]any{"Possession": 70.0, "XG": 2.4},
		"AwayTeamDetails": map[string]any{"Possession": 30.0, "XG": 0.6},
	}
	if got := dominanceFromDetails(home); got <= 0.5 || got > 1 {
		t.Errorf("home dominance = %v, want in (0.5,1]", got)
	}
	// Missing details → neutral, never NaN.
	if got := dominanceFromDetails(map[string]any{}); got != 0.5 {
		t.Errorf("empty dominance = %v, want 0.5", got)
	}
}

func TestLeagueMultiplierX100(t *testing.T) {
	// Below the lowest rung → unranked x1.00.
	if got := leagueMultiplierX100(0); got != 100 {
		t.Errorf("unranked multiplier = %d, want 100", got)
	}
	// Titan I (3000) → x2.00.
	if got := leagueMultiplierX100(3000); got != 200 {
		t.Errorf("titan multiplier = %d, want 200", got)
	}
	// Legend (3200) → x2.10.
	if got := leagueMultiplierX100(3200); got != 210 {
		t.Errorf("legend multiplier = %d, want 210", got)
	}
	// The helper agrees with the league core.
	l := league.LeagueFor(2500)
	if got := leagueMultiplierX100(2500); int(float64(got)) != int(l.Multiplier*100+0.5) {
		t.Errorf("multiplier drift: %d vs %v", got, l.Multiplier)
	}
}

// TestRaidOutcomeSummaryShape pins the summary's keys and UTC timestamp format.
func TestRaidOutcomeSummaryShape(t *testing.T) {
	shield := time.Date(2026, 10, 10, 13, 0, 0, 0, time.UTC)
	o := &RaidOutcome{
		RaidID: "r1", FixtureID: "f1", Stars: 2,
		AttackerGoals: 3, DefenderGoals: 1, Dominance: 0.71, Destruction: 71,
		StolenCash: 1200, StolenFans: 30, StolenTokens: 4, SystemBonus: 500,
		StandingAttacker: 24, StandingDefender: -24,
		ShieldUntil: &shield,
	}
	s := o.Summary()
	if s["stars"].(int) != 2 || s["destruction"].(int) != 71 {
		t.Errorf("summary stars/destruction = %v/%v", s["stars"], s["destruction"])
	}
	if got := s["shieldUntil"]; got != "2026-10-10T13:00:00.000Z" {
		t.Errorf("shieldUntil = %v, want absolute UTC", got)
	}
	if s["guardUntil"] != nil {
		t.Errorf("guardUntil = %v, want nil (granted by the sweep)", s["guardUntil"])
	}
	score := s["score"].(map[string]any)
	if score["you"].(int) != 3 || score["them"].(int) != 1 {
		t.Errorf("score = %v", score)
	}
}
