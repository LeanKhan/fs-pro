package abilities

import "testing"

// TestRegistryValuesAreDeclared asserts every registry entry maps to a declared
// hook (07 §1a): effect kinds, triggers and families must all be real values, so
// content can never smuggle in an opaque "story" string.
func TestRegistryValuesAreDeclared(t *testing.T) {
	effects := map[EffectKind]bool{
		EffectTendency: true, EffectNewAction: true, EffectCrossType: true,
		EffectHeaderQuality: true, EffectInterception: true,
		EffectStaminaSurge: true, EffectShotQuality: true,
	}
	triggers := map[TriggerWhen]bool{
		Always: true, MinuteAtLeast: true, Trailing: true, Leading: true,
		Drawing: true, StaminaBelow: true, MomentumBelow: true, PossessionBelow: true,
		ScorelineEquals: true, PhaseIs: true,
	}
	families := map[Family]bool{
		FamilyALL: true, FamilyGK: true, FamilyDEF: true, FamilyMID: true, FamilyATT: true,
	}
	for _, a := range Registry {
		if !effects[a.Effect] {
			t.Errorf("%s uses undeclared effect kind %q (07 §1a requires a declared hook)", a.ID, a.Effect)
		}
		if !triggers[a.Trigger] {
			t.Errorf("%s uses undeclared trigger %q", a.ID, a.Trigger)
		}
		if !families[a.Family] {
			t.Errorf("%s uses undeclared family %q", a.ID, a.Family)
		}
		if a.FacilityTier < 0 {
			t.Errorf("%s has negative facility tier %d", a.ID, a.FacilityTier)
		}
		if a.MasteryTier < 1 || a.MasteryTier > MaxMasteryTier {
			t.Errorf("%s mastery tier %d out of range 1..%d", a.ID, a.MasteryTier, MaxMasteryTier)
		}
	}
}

// TestRegistryCount pins the shipped catalogue size: all 16 rows of 03 §2.3.
// First-Time Volley, printed in the catalogue as "Elite + mastery 20", is
// carried data-only at the top of the shipped 0..5 facility / 1..5 mastery
// scales (facility 4, mastery 5).
func TestRegistryCount(t *testing.T) {
	if len(Registry) != 16 {
		t.Fatalf("registry size = %d, want 16", len(Registry))
	}
}

func TestMasteryTierForXpBoundaries(t *testing.T) {
	if got := MasteryTierForXp(-1); got != 1 {
		t.Errorf("negative XP tier = %d, want 1", got)
	}
	points := []struct{ xp, want int }{
		{0, 1}, {499, 1}, {500, 2}, {1499, 2}, {1500, 3},
		{3499, 3}, {3500, 4}, {6999, 4}, {7000, 5},
	}
	for _, p := range points {
		if got := MasteryTierForXp(p.xp); got != p.want {
			t.Errorf("MasteryTierForXp(%d) = %d, want %d", p.xp, got, p.want)
		}
	}
}

func TestEligibleIncludesAllFamilyForEveryFamily(t *testing.T) {
	for _, fam := range []Family{FamilyGK, FamilyDEF, FamilyMID, FamilyATT} {
		list := Eligible(fam, 4, 5)
		if len(list) == 0 {
			t.Fatalf("family %s has no eligible abilities at the top tier", fam)
		}
		hasAll := false
		for _, a := range list {
			if a.Family == FamilyALL {
				hasAll = true
			}
		}
		if !hasAll {
			t.Errorf("family %s should inherit the ALL-family syllabus", fam)
		}
	}
}

func TestEligibleRespectsGates(t *testing.T) {
	// Whipped Cross is facility 1 / mastery 2: it must be absent below either gate.
	for _, tc := range []struct{ fac, mas int }{{0, 5}, {1, 1}, {0, 1}} {
		for _, a := range Eligible(FamilyMID, tc.fac, tc.mas) {
			if a.ID == "whipped_cross" {
				t.Errorf("whipped_cross leaked at facility %d mastery %d", tc.fac, tc.mas)
			}
		}
	}
	// At the exact gates it must be present.
	found := false
	for _, a := range Eligible(FamilyMID, 1, 2) {
		if a.ID == "whipped_cross" {
			found = true
		}
	}
	if !found {
		t.Error("whipped_cross absent at its own (facility 1, mastery 2) gates")
	}
}
