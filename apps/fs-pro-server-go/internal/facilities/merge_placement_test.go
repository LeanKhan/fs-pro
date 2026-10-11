package facilities

import "testing"

func TestMergePlacementKeepsOldLayoutAndFitsNewBuildings(t *testing.T) {
	// A layout saved before the Club Shop and Vault existed (with retired
	// buildings still in it), and the youth academy moved onto the Vault's
	// default spot.
	saved := map[string]Placed{
		"stands": {X: 5, Z: 4}, "dugout": {X: 6, Z: -3}, "scouting": {X: 11, Z: -11}, "staff_house": {X: -10, Z: -8},
	}
	for _, k := range []string{"office", "stadium_grounds", "training_ground", "medical_centre"} {
		saved[k] = DefaultPlacement[k]
	}
	saved["youth_academy"] = Placed{X: -4, Z: 5, Rot: 0}

	got := MergePlacement(saved)
	if problem := ValidatePlacement(got); problem != "" {
		t.Fatalf("merged layout invalid: %s", problem)
	}
	if got["youth_academy"] != saved["youth_academy"] {
		t.Errorf("moved building reset: %v", got["youth_academy"])
	}
	if got["cash_vault"] == DefaultPlacement["cash_vault"] {
		t.Error("the vault was placed on top of the moved academy")
	}
	if _, ok := got["stands"]; ok {
		t.Error("retired buildings must be dropped from the layout")
	}
	for k, v := range DefaultPlacement {
		if _, ok := got[k]; !ok {
			t.Errorf("missing %s (default %v)", k, v)
		}
	}
}

func TestMergePlacementBrokenSaveFallsBack(t *testing.T) {
	saved := map[string]Placed{"office": {X: 4, Z: -1}, "stadium_grounds": {X: 4, Z: -1}}
	if got := MergePlacement(saved); got["office"] != DefaultPlacement["office"] {
		t.Errorf("overlapping save should fall back to the default layout, got office %v", got["office"])
	}
}

func TestMergePlacementEmptyIsDefault(t *testing.T) {
	got := MergePlacement(nil)
	if ValidatePlacement(got) != "" || len(got) != len(CampusBuildingKeys) {
		t.Fatalf("empty save should give the full default layout: %v", got)
	}
}
