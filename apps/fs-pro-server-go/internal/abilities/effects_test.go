package abilities

import (
	"encoding/json"
	"testing"
)

// TestEffectsForGolden pins the exact sim-core payload (07 §1a): the kind names
// and param keys are the contract the Rust engine consumes, so this is the
// drift guard between Go content and crates/sim-core.
func TestEffectsForGolden(t *testing.T) {
	slotted := []Ability{}
	for _, id := range []string{"whipped_cross", "tactical_foul", "sweeper_keeper_rush"} {
		a, ok := AbilityByID(id)
		if !ok {
			t.Fatalf("missing ability %s", id)
		}
		slotted = append(slotted, a)
	}
	ironWall, _ := TraitByID("iron_wall")
	engine, _ := TraitByID("engine")
	traits := []EquippedTrait{
		{Trait: ironWall, Rarity: RarityShiny},
		{Trait: engine, Rarity: RarityGlowy},
	}

	raw, err := json.Marshal(EffectsFor(slotted, traits))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	const want = `[` +
		`{"kind":"NewAction","params":{"action":5}},` +
		`{"kind":"NewAction","params":{"action":1},"trigger":{"when":"trailing"}},` +
		`{"kind":"CrossType","params":{"inswing":1}},` +
		`{"kind":"StaminaSurge","params":{"amount":15,"below":37.5}},` +
		`{"kind":"Interception","params":{"bonus":0.1,"lane":1}}` +
		`]`
	if string(raw) != want {
		t.Errorf("EffectsFor payload drifts from the sim-core contract:\n got %s\nwant %s", raw, want)
	}
}

// TestAbilityEffectCarriesTrigger pins the optional trigger (OW-P03): an ability
// with a non-`Always` trigger emits `{"trigger":{"when":...,"threshold":...}}`,
// and an `Always` ability omits the field so the payload stays byte-stable.
func TestAbilityEffectCarriesTrigger(t *testing.T) {
	cases := []struct {
		id     string
		when   string
		thresh float64
	}{
		{"clear_under_pressure", "possession_below", 45},
		{"tactical_foul", "trailing", 0},
		{"through_ball_in_behind", "leading", 0},
		{"high_press_trap", "drawing", 0},
		{"offside_trap_step_up", "leading", 0},
		{"talisman_second_wind", "stamina_below", 35},
	}
	for _, tc := range cases {
		a, ok := AbilityByID(tc.id)
		if !ok {
			t.Fatalf("missing ability %s", tc.id)
		}
		e := AbilityEffect(a)
		if e.Trigger == nil {
			t.Errorf("%s must carry a trigger", tc.id)
			continue
		}
		if e.Trigger.When != tc.when || e.Trigger.Threshold != tc.thresh {
			t.Errorf("%s trigger = %+v, want {when:%s threshold:%v}", tc.id, *e.Trigger, tc.when, tc.thresh)
		}
	}
	// `Always` abilities still omit the trigger field entirely.
	for _, a := range Registry {
		if a.Trigger != Always {
			continue
		}
		if e := AbilityEffect(a); e.Trigger != nil {
			t.Errorf("%s is Always but emitted a trigger %+v", a.ID, *e.Trigger)
		}
	}
}

// TestEffectsForTriggerPayloadGolden pins the exact bytes a triggered ability
// adds: the trigger object follows `params` and carries the threshold only when
// non-zero (so `Always`/threshold-free payloads stay minimal).
func TestEffectsForTriggerPayloadGolden(t *testing.T) {
	foul, _ := AbilityByID("tactical_foul")            // Trigger: Trailing (threshold 0)
	talisman, _ := AbilityByID("talisman_second_wind") // Trigger: StaminaBelow 35
	raw, err := json.Marshal(EffectsFor([]Ability{foul, talisman}, nil))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	const want = `[` +
		`{"kind":"NewAction","params":{"action":1},"trigger":{"when":"trailing"}},` +
		`{"kind":"StaminaSurge","params":{"amount":15,"below":35},"trigger":{"when":"stamina_below","threshold":35}}` +
		`]`
	if string(raw) != want {
		t.Errorf("trigger payload golden drifts:\n got %s\nwant %s", raw, want)
	}
}

func TestEffectsForDeterministicOrder(t *testing.T) {
	a, _ := AbilityByID("trivela_switch")
	b, _ := AbilityByID("standard_ground_pass")
	first, _ := json.Marshal(EffectsFor([]Ability{a, b}, nil))
	second, _ := json.Marshal(EffectsFor([]Ability{b, a}, nil))
	if string(first) != string(second) {
		t.Errorf("EffectsFor is order-dependent: %s vs %s", first, second)
	}
}

func TestEffectsForEmpty(t *testing.T) {
	raw, err := json.Marshal(EffectsFor(nil, nil))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if string(raw) != "[]" {
		t.Errorf("empty loadout = %s, want []", raw)
	}
}

// TestDeclaredEffectsMapToSimKinds asserts every registry/trait effect maps to
// one of the seven mechanisms sim-core implements (07 §1a), so content can never
// smuggle in an unresolvable mechanism.
func TestDeclaredEffectsMapToSimKinds(t *testing.T) {
	allowed := map[string]bool{
		"Tendency": true, "NewAction": true, "CrossType": true, "HeaderQuality": true,
		"Interception": true, "StaminaSurge": true, "ShotQuality": true,
	}
	for _, a := range Registry {
		if !allowed[a.Effect.SimKind()] {
			t.Errorf("ability %s effect %q has no sim-core kind", a.ID, a.Effect)
		}
	}
	for _, tr := range Traits {
		if !allowed[tr.Effect.SimKind()] {
			t.Errorf("trait %s effect %q has no sim-core kind", tr.ID, tr.Effect)
		}
	}
}

// TestNewActionAbilitiesCarryActionCode asserts the NewAction registry entries
// the engine knows carry the right action code, so the payload actually unlocks
// a decider action rather than being inert.
func TestNewActionAbilitiesCarryActionCode(t *testing.T) {
	cases := map[string]float64{
		"tactical_foul":          ActionTacticalFoul,
		"through_ball_in_behind": ActionThroughBall,
		"sweeper_keeper_rush":    ActionSweeperRush,
		"trivela_switch":         ActionTrivela,
		"first_time_volley":      ActionVolley,
	}
	for id, code := range cases {
		a, ok := AbilityByID(id)
		if !ok {
			t.Fatalf("missing ability %s", id)
		}
		e := AbilityEffect(a)
		if e.Kind != "NewAction" {
			t.Errorf("%s kind = %s, want NewAction", id, e.Kind)
		}
		if e.Params[ActionCodeParam] != code {
			t.Errorf("%s action code = %v, want %v", id, e.Params[ActionCodeParam], code)
		}
	}
}

func TestTraitEffectScalesWithRarity(t *testing.T) {
	trait, _ := TraitByID("clean_striker")
	shiny := TraitEffect(EquippedTrait{Trait: trait, Rarity: RarityShiny})
	starry := TraitEffect(EquippedTrait{Trait: trait, Rarity: RarityStarry})
	if shiny.Params["bonus"] != 0.12 {
		t.Errorf("shiny bonus = %v, want 0.12", shiny.Params["bonus"])
	}
	if starry.Params["bonus"] != 0.18 {
		t.Errorf("starry bonus = %v, want 0.18", starry.Params["bonus"])
	}
}
