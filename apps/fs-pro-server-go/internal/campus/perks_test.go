package campus

import (
	"errors"
	"testing"
)

// TestPerkRegistry pins the consumable Board Perks (04 §7): every advertised
// perk resolves, and a resource perk names a real currency. PerkCount is
// defensive, so a corrupted Clubs.Perks document can never be over-spent.
func TestPerkRegistry(t *testing.T) {
	for _, key := range PerkKeys() {
		def, ok := PerkDefFor(key)
		if !ok {
			t.Errorf("%s missing from Perks", key)
			continue
		}
		if def.Key != key || def.Name == "" {
			t.Errorf("%s has an inconsistent definition: %+v", key, def)
		}
		if def.Kind == PerkResource {
			if _, ok := balanceColumn(def.Currency); !ok {
				t.Errorf("%s grants unknown currency %q", key, def.Currency)
			}
			if def.Amount <= 0 {
				t.Errorf("%s grants a non-positive amount %v", key, def.Amount)
			}
		}
	}
	if _, ok := PerkDefFor("nope"); ok {
		t.Error("an unknown perk must not resolve")
	}
}

func TestPerkCountDefensive(t *testing.T) {
	perks := map[string]any{
		"cash_cache":   float64(2),
		"fan_cache":    int64(0),
		"talent_cache": -3,
		"bogus":        "not a number",
	}
	cases := map[string]int{
		"cash_cache":   2,
		"fan_cache":    0,
		"talent_cache": 0, // a negative counter reads as empty
		"bogus":        0, // a malformed counter reads as empty
		"missing":      0,
	}
	for key, want := range cases {
		if got := PerkCount(perks, key); got != want {
			t.Errorf("PerkCount(%s) = %d, want %d", key, got, want)
		}
	}
	if got := PerkCount(nil, "cash_cache"); got != 0 {
		t.Errorf("nil perks = %d, want 0", got)
	}
}

// TestResearchFacilitiesAreBuildable pins the P10 fix: the Coaching Department
// and Video Analysis are in the buildable campus set and cost Fans (04 §1.1).
func TestResearchFacilitiesAreBuildable(t *testing.T) {
	for _, key := range []string{"coaching_dept", "video_analysis"} {
		def, ok := FacilityDefFor(key)
		if !ok {
			t.Fatalf("%s is not in the campus facility set", key)
		}
		if def.Currency != Fans {
			t.Errorf("%s costs %s, want Fans (04 §1.1)", key, def.Currency)
		}
		if def.MaxLevel < 1 {
			t.Errorf("%s has no buildable levels", key)
		}
	}
}

// TestPerkKindsPinned pins the 04 §7 effect kinds: resource perks name a real
// currency; construction/research act on an upgrade and carry no currency; and
// every key the reward paths grant resolves in the registry.
func TestPerkKindsPinned(t *testing.T) {
	want := map[string]PerkKind{
		"resource_cache":  PerkResource,
		"instant_finish":  PerkConstruction,
		"builder_boost":   PerkConstruction,
		"research_finish": PerkResearch,
		"trait_trial":     PerkCombat,
		"regalia":         PerkCosmetic,
	}
	for key, kind := range want {
		def, ok := PerkDefFor(key)
		if !ok {
			t.Errorf("%s missing from the registry", key)
			continue
		}
		if def.Kind != kind {
			t.Errorf("%s kind = %q, want %q", key, def.Kind, kind)
		}
		if kind == PerkResource {
			if _, ok := balanceColumn(def.Currency); !ok || def.Amount <= 0 {
				t.Errorf("%s resource %q/%v invalid", key, def.Currency, def.Amount)
			}
		} else if def.Currency != "" {
			t.Errorf("%s (%s) must not name a currency", key, kind)
		}
	}
	// The registry order covers every registered key exactly once.
	seen := map[string]bool{}
	for _, key := range PerkKeys() {
		if seen[key] {
			t.Errorf("duplicate perk key %q in perkOrder", key)
		}
		seen[key] = true
		if _, ok := Perks[key]; !ok {
			t.Errorf("perkOrder key %q is not in the registry", key)
		}
	}
	if len(seen) != len(Perks) {
		t.Errorf("perkOrder has %d keys, registry has %d", len(seen), len(Perks))
	}
}

func TestValidatePerkTarget(t *testing.T) {
	instant, _ := PerkDefFor("instant_finish")
	research, _ := PerkDefFor("research_finish")
	cash, _ := PerkDefFor("cash_cache")
	cases := []struct {
		name    string
		def     PerkDef
		target  string
		wantErr error
	}{
		{"resource ignores the target", cash, "", nil},
		{"construction needs a target", instant, "", ErrPerkTargetRequired},
		{"construction rejects an unknown facility", instant, "nope", ErrPerkTargetInvalid},
		{"construction accepts a campus facility", instant, "club_shop", nil},
		{"construction accepts a research tile", instant, "coaching_dept", nil},
		{"research needs a target", research, "", ErrPerkTargetRequired},
		{"research rejects a non-research facility", research, "turnstiles", ErrPerkTargetInvalid},
		{"research accepts the coaching department", research, "coaching_dept", nil},
		{"research accepts video analysis", research, "video_analysis", nil},
	}
	for _, c := range cases {
		err := validatePerkTarget(c.def, c.target)
		if c.wantErr == nil {
			if err != nil {
				t.Errorf("%s: err = %v, want nil", c.name, err)
			}
			continue
		}
		if !errors.Is(err, c.wantErr) {
			t.Errorf("%s: err = %v, want %v", c.name, err, c.wantErr)
		}
	}
}

func TestIsResearchFacility(t *testing.T) {
	for _, key := range []string{"coaching_dept", "video_analysis"} {
		if !IsResearchFacility(key) {
			t.Errorf("%s must be a research facility", key)
		}
	}
	if IsResearchFacility("turnstiles") {
		t.Error("turnstiles is not a research facility")
	}
	if IsResearchFacility("") {
		t.Error("an empty key is not a research facility")
	}
}
