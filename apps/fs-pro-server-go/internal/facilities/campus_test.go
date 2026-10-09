package facilities

import "testing"

func copyPlacement(p map[string]Placed) map[string]Placed {
	out := map[string]Placed{}
	for k, v := range p {
		out[k] = v
	}
	return out
}

func TestDefaultPlacementIsValid(t *testing.T) {
	if problem := ValidatePlacement(DefaultPlacement); problem != "" {
		t.Fatalf("default placement invalid: %s", problem)
	}
}

func TestPlacementOffCampus(t *testing.T) {
	p := copyPlacement(DefaultPlacement)
	p["scouting"] = Placed{X: 13, Z: -11, Rot: 0} // 2-wide → x=14 off campus
	if problem := ValidatePlacement(p); problem == "" {
		t.Fatal("off-campus placement must be rejected")
	}
}

func TestPlacementOverlap(t *testing.T) {
	p := copyPlacement(DefaultPlacement)
	p["scouting"] = p["youth_academy"] // same top-left → overlaps
	if problem := ValidatePlacement(p); problem == "" {
		t.Fatal("overlapping placement must be rejected")
	}
}

func TestPlacementMissingAndBadRot(t *testing.T) {
	p := copyPlacement(DefaultPlacement)
	delete(p, "dugout")
	if problem := ValidatePlacement(p); problem == "" {
		t.Fatal("missing building must be rejected")
	}
	p = copyPlacement(DefaultPlacement)
	p["dugout"] = Placed{X: 0, Z: 0, Rot: 7}
	if problem := ValidatePlacement(p); problem == "" {
		t.Fatal("bad rotation must be rejected")
	}
}

func TestPlacementPlazaReserved(t *testing.T) {
	p := copyPlacement(DefaultPlacement)
	// The plaza covers (-1,-1)..(0,0); park a building on it.
	p["scouting"] = Placed{X: -1, Z: -1, Rot: 0}
	if problem := ValidatePlacement(p); problem == "" {
		t.Fatal("plaza cells must be reserved")
	}
}
