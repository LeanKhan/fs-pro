package abilities

import "testing"

func TestTraitCatalogValid(t *testing.T) {
	seen := map[string]bool{}
	for _, tr := range Traits {
		if tr.ID == "" || tr.Name == "" {
			t.Errorf("trait %+v needs an id and name", tr)
		}
		if seen[tr.ID] {
			t.Errorf("duplicate trait id %q", tr.ID)
		}
		seen[tr.ID] = true
		if tr.Effect.SimKind() == "" {
			t.Errorf("trait %s has effect %q with no sim kind", tr.ID, tr.Effect)
		}
	}
	if _, ok := TraitByID("aerial_threat"); !ok {
		t.Error("aerial_threat must resolve")
	}
	if _, ok := TraitByID("nope"); ok {
		t.Error("unknown trait must not resolve")
	}
}

func TestRarity(t *testing.T) {
	for _, r := range []Rarity{RarityShiny, RarityGlowy, RarityStarry} {
		if !r.Valid() {
			t.Errorf("%s should be valid", r)
		}
	}
	if Rarity("legendary").Valid() {
		t.Error("legendary is not a rarity")
	}
	if got := NormalizeRarity(""); got != RarityShiny {
		t.Errorf("empty rarity = %s, want shiny", got)
	}
	mults := map[Rarity]float64{RarityShiny: 1.0, RarityGlowy: 1.25, RarityStarry: 1.5}
	for r, want := range mults {
		if got := RarityMultiplier(r); got != want {
			t.Errorf("RarityMultiplier(%s) = %v, want %v", r, got, want)
		}
	}
}

func TestNextRarity(t *testing.T) {
	if n, ok := NextRarity(RarityShiny); !ok || n != RarityGlowy {
		t.Errorf("shiny -> %s/%v, want glowy/true", n, ok)
	}
	if n, ok := NextRarity(RarityGlowy); !ok || n != RarityStarry {
		t.Errorf("glowy -> %s/%v, want starry/true", n, ok)
	}
	if _, ok := NextRarity(RarityStarry); ok {
		t.Error("starry has no next tier")
	}
}

func TestAlloyCostAndArithmetic(t *testing.T) {
	shiny, ok := AlloyCost(RarityShiny)
	if !ok || shiny != (Alloys{Shiny: 100}) {
		t.Errorf("shiny upgrade cost = %+v/%v, want {Shiny:100}/true", shiny, ok)
	}
	glowy, ok := AlloyCost(RarityGlowy)
	if !ok || glowy != (Alloys{Glowy: 60}) {
		t.Errorf("glowy upgrade cost = %+v/%v, want {Glowy:60}/true", glowy, ok)
	}
	if _, ok := AlloyCost(RarityStarry); ok {
		t.Error("starry has no upgrade cost")
	}
	have := Alloys{Shiny: 120, Glowy: 10}
	if !have.Covers(shiny) {
		t.Error("120 shiny should cover a 100-shiny cost")
	}
	if have.Covers(glowy) {
		t.Error("120 shiny must not cover a glowy cost")
	}
	if got := have.Minus(shiny); got != (Alloys{Shiny: 20, Glowy: 10}) {
		t.Errorf("120/10 minus 100/0 = %+v", got)
	}
}
