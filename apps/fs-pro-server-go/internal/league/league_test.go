package league

import "testing"

func TestLeagueFor(t *testing.T) {
	cases := []struct {
		points int
		name   string
		div    int
	}{
		{0, "Unranked", 0},
		{399, "Unranked", 0},
		{400, "Bronze", 3},
		{650, "Bronze", 1},
		{3199, "Titan", 1},
		{3200, "Legend", 0},
		{9999, "Legend", 0},
	}
	for _, c := range cases {
		got := LeagueFor(c.points)
		if got.Name != c.name || got.Division != c.div {
			t.Errorf("LeagueFor(%d) = %s %d, want %s %d", c.points, got.Name, got.Division, c.name, c.div)
		}
	}
}

func TestLeagueIndexMonotonic(t *testing.T) {
	if LeagueIndex(0) != -1 {
		t.Errorf("unranked index = %d, want -1", LeagueIndex(0))
	}
	if LeagueIndex(400) != 0 {
		t.Errorf("Bronze III index = %d, want 0", LeagueIndex(400))
	}
	prev := -1
	for _, p := range []int{400, 800, 1200, 1600, 2000, 2400, 2800, 3200} {
		i := LeagueIndex(p)
		if i <= prev {
			t.Fatalf("league index not increasing at %d: %d after %d", p, i, prev)
		}
		prev = i
	}
}

func TestLootMultiplierRises(t *testing.T) {
	if LeagueFor(400).Multiplier >= LeagueFor(3200).Multiplier {
		t.Fatal("the apex league must have the highest loot multiplier")
	}
}

func TestAttacksPerPool(t *testing.T) {
	if got := AttacksPerPool(-1); got != 6 {
		t.Errorf("unranked attacks = %d, want 6", got)
	}
	if got := AttacksPerPool(0); got != 6 {
		t.Errorf("lowest league attacks = %d, want 6", got)
	}
	if got := AttacksPerPool(21); got != 27 {
		t.Errorf("Legend attacks = %d, want 27", got)
	}
	if got := AttacksPerPool(40); got != 30 {
		t.Errorf("attacks must cap at 30, got %d", got)
	}
}

func TestPromoteRelegate(t *testing.T) {
	if p, r := PromoteRelegate(100); p != 10 || r != 10 {
		t.Errorf("pool of 100 => (%d,%d), want (10,10)", p, r)
	}
	if p, r := PromoteRelegate(37); p != 3 || r != 3 {
		t.Errorf("pool of 37 => (%d,%d), want (3,3)", p, r)
	}
}

func TestStandingDelta(t *testing.T) {
	if got := StandingDelta(1000, 1000, 2); got != 24 {
		t.Errorf("even clear win = %d, want 24", got)
	}
	if got := StandingDelta(1000, 1200, 2); got != 28 {
		t.Errorf("beating a stronger club = %d, want 28", got)
	}
	if got := StandingDelta(1000, 800, 2); got != 20 {
		t.Errorf("beating a weaker club = %d, want 20", got)
	}
	if got := StandingDelta(1000, 1200, 0); got != -26 {
		t.Errorf("losing to a stronger club = %d, want -26 (less punishment)", got)
	}
	if got := StandingDelta(1000, 800, 0); got != -34 {
		t.Errorf("losing to a weaker club = %d, want -34 (more punishment)", got)
	}
	if got := StandingDelta(1000, 1000, 3); got != 32 {
		t.Errorf("dominant even win = %d, want 32", got)
	}
}

func TestFormBonusReady(t *testing.T) {
	if FormBonusReady(4) {
		t.Error("4 stars must not earn the Form Bonus")
	}
	if !FormBonusReady(5) {
		t.Error("5 stars must earn the Form Bonus")
	}
}
