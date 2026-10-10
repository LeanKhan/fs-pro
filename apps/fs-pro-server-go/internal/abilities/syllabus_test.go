package abilities

import "testing"

func TestFacilityTierForResearch(t *testing.T) {
	cases := []struct {
		coaching, video, want int
	}{
		{0, 0, 0},
		{1, 0, 1},
		{3, 0, 3},
		{3, 2, 5},
		{4, 3, 5},   // clamped
		{-1, -1, 0}, // clamped low
		{2, 1, 3},
	}
	for _, c := range cases {
		if got := FacilityTierForResearch(c.coaching, c.video); got != c.want {
			t.Errorf("FacilityTierForResearch(%d,%d) = %d, want %d", c.coaching, c.video, got, c.want)
		}
	}
}

func TestSyllabusGroupsAndFiltersByFamily(t *testing.T) {
	def := Syllabus(FamilyDEF)
	if len(def) == 0 {
		t.Fatal("DEF syllabus is empty")
	}
	// Tiers come back sorted ascending and each ability actually belongs there.
	last := -1
	sawClear := false
	for _, tier := range def {
		if tier.FacilityTier <= last {
			t.Errorf("syllabus tiers out of order: %d after %d", tier.FacilityTier, last)
		}
		last = tier.FacilityTier
		for _, a := range tier.Abilities {
			if a.FacilityTier != tier.FacilityTier {
				t.Errorf("%s filed under tier %d, belongs to %d", a.ID, tier.FacilityTier, a.FacilityTier)
			}
			if a.ID == "clear_under_pressure" {
				sawClear = true
			}
			if a.Family == FamilyMID || a.Family == FamilyATT || a.Family == FamilyGK {
				t.Errorf("DEF syllabus leaked %s (%s)", a.ID, a.Family)
			}
		}
	}
	if !sawClear {
		t.Error("DEF syllabus should include clear_under_pressure")
	}
}

func TestSyllabusIncludesAllFamily(t *testing.T) {
	// standard_ground_pass is ALL-family and must appear in every family syllabus.
	for _, fam := range []Family{FamilyGK, FamilyDEF, FamilyMID, FamilyATT} {
		found := false
		for _, tier := range Syllabus(fam) {
			for _, a := range tier.Abilities {
				if a.ID == "standard_ground_pass" {
					found = true
				}
			}
		}
		if !found {
			t.Errorf("family %s syllabus missing the ALL-family baseline", fam)
		}
	}
}

func TestCanSlotRespectsFamilyAndGates(t *testing.T) {
	whipped, _ := AbilityByID("whipped_cross")
	if !CanSlot(whipped, FamilyMID, 1, 2) {
		t.Error("MID @ facility1/mastery2 must slot whipped_cross")
	}
	if CanSlot(whipped, FamilyDEF, 5, 5) {
		t.Error("whipped_cross is MID-only; DEF must not slot it")
	}
	if CanSlot(whipped, FamilyMID, 0, 5) {
		t.Error("whipped_cross needs facility 1")
	}
	if CanSlot(whipped, FamilyMID, 1, 1) {
		t.Error("whipped_cross needs mastery 2")
	}
}

func TestFamilyOfArchetypeID(t *testing.T) {
	if got := FamilyOfArchetypeID("keeper"); got != FamilyGK {
		t.Errorf("keeper family = %s, want GK", got)
	}
	if got := FamilyOfArchetypeID("nope"); got != FamilyALL {
		t.Errorf("unknown archetype family = %s, want ALL", got)
	}
}

func TestAbilityByID(t *testing.T) {
	if _, ok := AbilityByID("trivela_switch"); !ok {
		t.Error("trivela_switch must resolve")
	}
	if _, ok := AbilityByID("nope"); ok {
		t.Error("unknown ability must not resolve")
	}
}
