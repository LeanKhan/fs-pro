package abilities

import "testing"

func TestRegistryIDsUnique(t *testing.T) {
	seen := map[string]bool{}
	for _, a := range Registry {
		if a.ID == "" {
			t.Error("every ability needs an id")
		}
		if seen[a.ID] {
			t.Errorf("duplicate ability id %q", a.ID)
		}
		seen[a.ID] = true
	}
}

func TestMasteryTierForXp(t *testing.T) {
	cases := map[int]int{0: 1, 499: 1, 500: 2, 1499: 2, 1500: 3, 3499: 3, 3500: 4, 6999: 4, 7000: 5, 1_000_000: 5}
	for xp, want := range cases {
		if got := MasteryTierForXp(xp); got != want {
			t.Errorf("MasteryTierForXp(%d) = %d, want %d", xp, got, want)
		}
	}
}

func TestSlotCount(t *testing.T) {
	cases := map[int]int{0: 1, 1: 1, 2: 2, 3: 3, 4: 3, 9: 3}
	for tier, want := range cases {
		if got := SlotCount(tier); got != want {
			t.Errorf("SlotCount(%d) = %d, want %d", tier, got, want)
		}
	}
}

func TestCanLearn(t *testing.T) {
	var clear, whipped Ability
	for _, a := range Registry {
		switch a.ID {
		case "clear_under_pressure":
			clear = a
		case "whipped_cross":
			whipped = a
		}
	}
	if !CanLearn(clear, 0, 1) {
		t.Error("clear_under_pressure should be learnable at facility 0 / mastery 1")
	}
	if CanLearn(whipped, 0, 2) {
		t.Error("whipped_cross needs facility 1")
	}
	if CanLearn(whipped, 1, 1) {
		t.Error("whipped_cross needs mastery 2")
	}
	if !CanLearn(whipped, 1, 2) {
		t.Error("whipped_cross should be learnable at facility 1 / mastery 2")
	}
}

func TestEligibleFamilyFilter(t *testing.T) {
	defs := Eligible(FamilyDEF, 4, 5)
	got := map[string]bool{}
	for _, a := range defs {
		got[a.ID] = true
	}
	if !got["tactical_foul"] || !got["slide_tackle_recovery"] || !got["offside_trap_step_up"] {
		t.Errorf("DEF syllabus incomplete: %v", got)
	}
	if got["whipped_cross"] || got["sweeper_keeper_rush"] {
		t.Errorf("DEF syllabus leaked another family: %v", got)
	}
}

func TestEligibleALLFamily(t *testing.T) {
	// Only ALL-family abilities are eligible for the ALL family.
	list := Eligible(FamilyALL, 0, 1)
	if len(list) != 1 || list[0].ID != "standard_ground_pass" {
		t.Fatalf("ALL@0,1 = %+v, want just standard_ground_pass", list)
	}
}
