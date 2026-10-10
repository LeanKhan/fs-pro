package association

import (
	"testing"
	"time"
)

func TestAggregateDerbyAndDecide(t *testing.T) {
	home := map[string]bool{"h1": true, "h2": true}
	matches := []DerbyMatch{
		{AttackerClubID: "h1", Stars: 3, Destruction: 90},
		{AttackerClubID: "h2", Stars: 2, Destruction: 60},
		{AttackerClubID: "a1", Stars: 3, Destruction: 70},
		{AttackerClubID: "a2", Stars: 1, Destruction: 50},
	}
	agg := AggregateDerby(home, matches)
	if agg.HomeStars != 5 || agg.AwayStars != 4 {
		t.Fatalf("stars = %d-%d, want 5-4", agg.HomeStars, agg.AwayStars)
	}
	if agg.HomeDestruction != 75 || agg.AwayDestruction != 60 {
		t.Fatalf("destruction = %v-%v, want 75-60", agg.HomeDestruction, agg.AwayDestruction)
	}
	if got := DecideDerby(agg); got != Home {
		t.Fatalf("DecideDerby = %v, want Home", got)
	}
}

// TestDecideDerbyTiebreakOnDestruction proves the audited tiebreak still applies
// once the aggregate is reduced: equal stars -> greater mean destruction wins.
func TestDecideDerbyTiebreakOnDestruction(t *testing.T) {
	home := map[string]bool{"h1": true}
	agg := AggregateDerby(home, []DerbyMatch{
		{AttackerClubID: "h1", Stars: 2, Destruction: 55},
		{AttackerClubID: "a1", Stars: 2, Destruction: 60},
	})
	if got := DecideDerby(agg); got != Away {
		t.Fatalf("DecideDerby = %v, want Away", got)
	}
	tie := AggregateDerby(home, []DerbyMatch{
		{AttackerClubID: "h1", Stars: 2, Destruction: 60},
		{AttackerClubID: "a1", Stars: 2, Destruction: 60},
	})
	if got := DecideDerby(tie); got != Draw {
		t.Fatalf("a total tie must draw, got %v", got)
	}
}

func TestPhaseAt(t *testing.T) {
	base := time.Date(2026, time.October, 10, 0, 0, 0, 0, time.UTC)
	prep := base
	battle := base.Add(24 * time.Hour)
	ends := base.Add(48 * time.Hour)
	cases := []struct {
		name string
		when time.Time
		want Phase
	}{
		{"before prep", prep.Add(-time.Hour), PhasePrep},
		{"at prep start", prep, PhasePrep},
		{"just before battle", battle.Add(-time.Nanosecond), PhasePrep},
		{"at battle start", battle, PhaseBattle},
		{"during battle", battle.Add(12 * time.Hour), PhaseBattle},
		{"just before end", ends.Add(-time.Nanosecond), PhaseBattle},
		{"at end", ends, PhaseComplete},
		{"after end", ends.Add(time.Hour), PhaseComplete},
	}
	for _, c := range cases {
		if got := PhaseAt(c.when, prep, battle, ends); got != c.want {
			t.Errorf("%s: PhaseAt = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestCanAttempt(t *testing.T) {
	if !CanAttempt(0) || !CanAttempt(DerbyAttemptsPerClub-1) {
		t.Fatal("attempts under the cap must be allowed")
	}
	if CanAttempt(DerbyAttemptsPerClub) || CanAttempt(-1) {
		t.Fatal("attempts at/over the cap must be refused")
	}
}

func TestDerbyReward(t *testing.T) {
	if DerbyReward(Home, false, 6) <= 0 {
		t.Fatal("a won derby must pay")
	}
	if DerbyReward(Home, true, 6) != 0 || DerbyReward(Away, true, 6) != 0 {
		t.Fatal("a practice derby must pay nothing")
	}
	if DerbyReward(Draw, false, 4) != 0 {
		t.Fatal("a drawn derby must pay nothing")
	}
	if DerbyReward(Home, false, 100) > 10000 {
		t.Fatal("reward must be capped")
	}
}
