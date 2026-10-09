package player

import (
	"math/rand"
	"testing"
)

func attributesAll(value float64) map[string]any {
	attrs := map[string]any{}
	for _, key := range generatorAttributes {
		attrs[key] = value
	}
	return attrs
}

func TestCalculatePlayerRatingIsWeightedSum(t *testing.T) {
	// AllMultipliers uses the "SetPiece" key, while stored attributes use
	// "Setpiece" (lowercase p); like Node, a weight whose key isn't present is
	// skipped, so an all-50 ST (weight sum 0.96) rates 48 while GK (whose
	// SetPiece weight is 0) rates 50.
	if got := CalculatePlayerRating(attributesAll(50), "ATT", "ST"); got != 48 {
		t.Fatalf("ST rating = %v, want 48", got)
	}
	if got := CalculatePlayerRating(attributesAll(50), "GK", "GK"); got != 50 {
		t.Fatalf("GK rating = %v, want 50", got)
	}
	if got := CalculatePlayerRating(attributesAll(110), "ATT", "ST"); got != 99 {
		t.Fatalf("rating must cap at 99, got %v", got)
	}
}

func TestCalculatePlayerRatingUnknownPosition(t *testing.T) {
	if got := CalculatePlayerRating(attributesAll(50), "XX", "ST"); got != -10000 {
		t.Fatalf("unknown position = %v, want -10000", got)
	}
}

func TestCalculatePlayerValueAndWage(t *testing.T) {
	// GK, rating 50, age 25: base 20000, GK position factor -40, GK age -2.
	value := CalculatePlayerValue("GK", 50, 25)
	if value != 11600 {
		t.Fatalf("GK value = %v, want 11600", value)
	}
	if wage := CalculatePlayerWage(value); wage != 1740 {
		t.Fatalf("wage = %v, want 1740", wage)
	}
}

func TestRolesForPosition(t *testing.T) {
	if got := RolesForPosition("GK"); len(got) != 1 || got[0] != "GK" {
		t.Fatalf("GK roles = %v", got)
	}
	if got := RolesForPosition("ATT"); len(got) != 3 {
		t.Fatalf("ATT roles = %v", got)
	}
}

func TestGeneratePlayer(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	p := GeneratePlayer("ATT", "bellean", rng)
	if p["Position"] != "ATT" {
		t.Fatalf("position = %v", p["Position"])
	}
	if _, ok := p["Attributes"].(map[string]any); !ok {
		t.Fatalf("attributes missing: %v", p["Attributes"])
	}
	if st, ok := p["Attributes"].(map[string]any)["Setpiece"]; !ok || st != 64 {
		t.Fatalf("position-specific Setpiece should be 64, got %v", st)
	}
	if p["isSigned"] != false {
		t.Fatalf("generated player should be unsigned")
	}
	if _, ok := p["Rating"].(float64); !ok {
		t.Fatalf("rating missing: %v", p["Rating"])
	}
}

// D6: youth must be 16-18 and marked isYouth.
func TestGenerateYouthAgeRange(t *testing.T) {
	rng := rand.New(rand.NewSource(7))
	for i := 0; i < 50; i++ {
		p := GenerateYouth("ATT", rng)
		age, _ := p["Age"].(int)
		if age < 16 || age > 18 {
			t.Fatalf("youth age = %v, want 16..18", p["Age"])
		}
		if p["isYouth"] != true {
			t.Fatalf("youth must be marked isYouth: %v", p)
		}
		if name, _ := p["FirstName"].(string); name == "" {
			t.Fatal("youth must have a non-empty first name")
		}
		attrs, _ := p["Attributes"].(map[string]any)
		// Keeping is not in ATT's position-specific set: base range 10..35.
		if v, ok := attrs["Keeping"].(int); !ok || v < 10 || v > 35 {
			t.Fatalf("youth Keeping = %v, want 10..35", attrs["Keeping"])
		}
		// Speed is position-specific: elevated range 30..45.
		if v, ok := attrs["Speed"].(int); !ok || v < 30 || v > 45 {
			t.Fatalf("youth Speed = %v, want 30..45", attrs["Speed"])
		}
	}
}

func TestTruthyAndNullish(t *testing.T) {
	if truthy(0) || truthy("") || truthy(nil) || !truthy(1) || !truthy("x") {
		t.Fatal("truthy must mirror JS truthiness")
	}
	data := map[string]any{"Position": "", "Age": 0}
	existing := map[string]any{"Position": "ST", "Age": 30}
	// nullish keeps explicit ""/0 rather than falling back.
	if got := nullishString(data, "Position", existing, "Position"); got != "" {
		t.Fatalf("nullishString Position = %q, want empty", got)
	}
	if got := ageOf(nullishValue(data, existing, "Age")); got != 0 {
		t.Fatalf("nullish Age = %d, want 0", got)
	}
}
