package campus

import "testing"

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
