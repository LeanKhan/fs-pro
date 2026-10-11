package clubhouse

import "testing"

// TestCapForTier pins the downward gate: a non-Clubhouse facility is capped at
// the Clubhouse tier, clamped to [1, MaxTier]. This is the CoC "Town Hall caps
// every building" rule (04 §1.1) that stops a club mainlining one facility.
func TestCapForTier(t *testing.T) {
	cases := map[int]int{0: 1, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 5, 99: 5}
	for tier, want := range cases {
		if got := CapForTier(tier); got != want {
			t.Errorf("CapForTier(%d) = %d, want %d", tier, got, want)
		}
	}
}

func TestGroundskeepersForTier(t *testing.T) {
	cases := map[int]int{0: 1, 1: 1, 2: 2, 3: 3, 4: 3, 5: 3}
	for tier, want := range cases {
		if got := GroundskeepersForTier(tier); got != want {
			t.Errorf("GroundskeepersForTier(%d) = %d, want %d", tier, got, want)
		}
	}
}

func TestCanStartUpgrade(t *testing.T) {
	cases := []struct {
		active, keepers int
		want            bool
	}{
		{0, 1, true},
		{1, 1, false},
		{1, 2, true},
		{2, 2, false},
		{0, 0, false},
		{5, 9, true}, // keeper count is capped at MaxGroundskeepers (6)
	}
	for _, c := range cases {
		if got := CanStartUpgrade(c.active, c.keepers); got != c.want {
			t.Errorf("CanStartUpgrade(%d,%d) = %v, want %v", c.active, c.keepers, got, c.want)
		}
	}
}

// TestEffectiveGroundskeepers pins the single crew-clamp rule every read uses:
// floor at the milestone grant, ceiling at MaxGroundskeepers, never below one.
func TestEffectiveGroundskeepers(t *testing.T) {
	// A stored 0 is raised to the tier milestone (tier 3 -> 3).
	if got := EffectiveGroundskeepers(0, 3); got != 3 {
		t.Errorf("stored 0 at tier 3 = %d, want 3", got)
	}
	// A stored value above the cap clamps to MaxGroundskeepers.
	if got := EffectiveGroundskeepers(99, 1); got != MaxGroundskeepers {
		t.Errorf("stored 99 = %d, want %d", got, MaxGroundskeepers)
	}
	// A stored value between milestone and cap is preserved.
	if got := EffectiveGroundskeepers(5, 1); got != 5 {
		t.Errorf("stored 5 at tier 1 = %d, want 5", got)
	}
	// Tier 0/negative still grants the minimum of one.
	if got := EffectiveGroundskeepers(0, 0); got != 1 {
		t.Errorf("stored 0 at tier 0 = %d, want 1", got)
	}
}

func TestClubhouseRequirementsGraph(t *testing.T) {
	if reqs := Requirements(1); len(reqs) != 0 {
		t.Errorf("tier 1 is the start, want no requirements, got %v", reqs)
	}
	for tier := 2; tier <= MaxTier; tier++ {
		if reqs := Requirements(tier); len(reqs) == 0 {
			t.Errorf("tier %d has no requirements", tier)
		}
	}
	if reqs := Requirements(MaxTier + 1); reqs != nil {
		t.Errorf("tier above max should have no graph, got %v", reqs)
	}
	// A nil level map must not panic and must report every requirement missing.
	req3 := Requirements(3)
	if missing := Missing(3, nil); len(missing) != len(req3) {
		t.Errorf("nil levels: missing=%d, want %d", len(missing), len(req3))
	}
	// A partial campus must name exactly the missing prerequisite.
	ok, ms := CanUpgrade(3, map[string]int{"turnstiles": 2, "club_shop": 2, "training_ground": 2})
	if ok || len(ms) != 1 || ms[0].Facility != "youth_academy" {
		t.Errorf("tier 3 partial: ok=%v missing=%v, want false / [youth_academy]", ok, ms)
	}
}

func TestCanUpgradeClubhouse(t *testing.T) {
	if ok, _ := CanUpgrade(1, nil); !ok {
		t.Error("tier 1 is the start, should be allowed")
	}
	if ok, missing := CanUpgrade(2, map[string]int{}); ok || len(missing) != 2 {
		t.Errorf("tier 2 with an empty campus: ok=%v missing=%v, want false / 2", ok, missing)
	}
	met := map[string]int{"training_ground": 1, "youth_academy": 1}
	if ok, missing := CanUpgrade(2, met); !ok || len(missing) != 0 {
		t.Errorf("tier 2 met: ok=%v missing=%v, want true / 0", ok, missing)
	}
	if ok, _ := CanUpgrade(MaxTier+1, met); ok {
		t.Error("tier above MaxTier must be refused")
	}
}

func TestGroundskeeperPrice(t *testing.T) {
	if _, ok := GroundskeeperPrice(3); ok {
		t.Error("Groundskeeper #3 is a milestone, not purchasable")
	}
	if p, ok := GroundskeeperPrice(4); !ok || p != 500 {
		t.Errorf("Groundskeeper #4 price = %v/%v, want 500/true", p, ok)
	}
	if p, ok := GroundskeeperPrice(5); !ok || p != 1000 {
		t.Errorf("Groundskeeper #5 price = %v/%v, want 1000/true", p, ok)
	}
	if _, ok := GroundskeeperPrice(6); ok {
		t.Error("Groundskeeper #6 is Club Legacy, not purchasable")
	}
}
