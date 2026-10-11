package league

import (
	"math"
	"testing"
)

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

// TestLadderShape pins the documented ladder: 22 rungs (7 tiers x 3 divisions +
// a single Legend), strictly ascending bounds and strictly rising multipliers.
func TestLadderShape(t *testing.T) {
	if len(Leagues) != 22 {
		t.Fatalf("ladder rungs = %d, want 22 (7 x 3 divisions + single Legend)", len(Leagues))
	}
	legend := 0
	for i, l := range Leagues {
		if i > 0 {
			if l.LowerBound <= Leagues[i-1].LowerBound {
				t.Errorf("rung %d lower bound %d not above %d", i, l.LowerBound, Leagues[i-1].LowerBound)
			}
			if l.Multiplier <= Leagues[i-1].Multiplier {
				t.Errorf("rung %d multiplier %.2f not above %.2f", i, l.Multiplier, Leagues[i-1].Multiplier)
			}
		}
		if l.Name == "Legend" {
			legend++
		}
	}
	if legend != 1 {
		t.Errorf("Legend must be a single apex rung, found %d", legend)
	}
}

// TestLeagueBoundaries checks every rung boundary: the bound lands on its own
// rung and one point below lands on the previous rung (or unranked).
func TestLeagueBoundaries(t *testing.T) {
	for i, l := range Leagues {
		if got := LeagueIndex(l.LowerBound); got != i {
			t.Errorf("LeagueIndex(%d) = %d, want rung %d", l.LowerBound, got, i)
		}
		if got := LeagueIndex(l.LowerBound - 1); got != i-1 {
			t.Errorf("LeagueIndex(%d) = %d, want rung %d", l.LowerBound-1, got, i-1)
		}
		if got := LeagueFor(l.LowerBound); got != l {
			t.Errorf("LeagueFor(%d) = %+v, want %+v", l.LowerBound, got, l)
		}
	}
}

// TestEveryRungReachable guards against an unreachable rung (a bound shadowed by
// a later/earlier entry).
func TestEveryRungReachable(t *testing.T) {
	seen := map[int]bool{}
	for _, l := range Leagues {
		seen[LeagueIndex(l.LowerBound)] = true
	}
	if len(seen) != len(Leagues) {
		t.Errorf("only %d/%d rungs reachable", len(seen), len(Leagues))
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

// TestAttacksPerPoolScales asserts monotonic scaling across the real ladder and
// that the 30 cap holds for out-of-range indices without integer overflow.
func TestAttacksPerPoolScales(t *testing.T) {
	prev := 0
	for i := range Leagues {
		n := AttacksPerPool(i)
		if n < prev {
			t.Errorf("attacks regressed at rung %d: %d after %d", i, n, prev)
		}
		prev = n
	}
	if got := AttacksPerPool(1000); got != 30 {
		t.Errorf("AttacksPerPool(1000) = %d, want the 30 cap", got)
	}
	// math.MaxInt + 6 would overflow a naive implementation to a negative value.
	if got := AttacksPerPool(math.MaxInt); got != 30 {
		t.Errorf("AttacksPerPool(MaxInt) = %d, want 30 (must not overflow)", got)
	}
	if got := AttacksPerPool(-100); got != 6 {
		t.Errorf("AttacksPerPool(-100) = %d, want 6", got)
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

// TestStandingDeltaClamps pins the +/-8 adjustment clamp and the star clamp, so
// a wildly mismatched Standing gap cannot dominate the base star delta.
func TestStandingDeltaClamps(t *testing.T) {
	// A gap of 1000 gives adj = 20, clamped to +8: 24 + 8 = 32.
	if got := StandingDelta(0, 100_000, 2); got != 32 {
		t.Errorf("huge positive gap = %d, want 32 (adj clamped to +8)", got)
	}
	// A gap of -1000 gives adj = -20, clamped to -8: 24 - 8 = 16.
	if got := StandingDelta(100_000, 0, 2); got != 16 {
		t.Errorf("huge negative gap = %d, want 16 (adj clamped to -8)", got)
	}
	// Star ratings outside 0..3 are clamped, not out-of-bounds.
	if got := StandingDelta(1000, 1000, -5); got != -30 {
		t.Errorf("negative stars = %d, want the 0-star delta -30", got)
	}
	if got := StandingDelta(1000, 1000, 99); got != 32 {
		t.Errorf("excess stars = %d, want the 3-star delta 32", got)
	}
}

// TestPromoteRelegateSmallPools documents the small-pool behaviour: a pool too
// small to place 10% promotes/relegates nobody rather than going negative.
func TestPromoteRelegateSmallPools(t *testing.T) {
	if p, r := PromoteRelegate(9); p != 0 || r != 0 {
		t.Errorf("pool of 9 => (%d,%d), want (0,0)", p, r)
	}
	if p, r := PromoteRelegate(10); p != 1 || r != 1 {
		t.Errorf("pool of 10 => (%d,%d), want (1,1)", p, r)
	}
	if p, r := PromoteRelegate(0); p != 0 || r != 0 {
		t.Errorf("pool of 0 => (%d,%d), want (0,0)", p, r)
	}
	if p, r := PromoteRelegate(-5); p != 0 || r != 0 {
		t.Errorf("negative pool => (%d,%d), want (0,0)", p, r)
	}
}
