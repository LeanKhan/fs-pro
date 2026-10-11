package abilities

import "sort"

// This file is the Go half of the Wave-1 handoff (07 §1a): the pure, typed
// payload sim-core consumes. sim-core implements a small fixed set of effect
// *kinds*; the registry supplies the numbers. `EffectsFor` resolves a player's
// slotted abilities and equipped traits into that payload once, at build time.

// RawEffect is one sim-core effect: a mechanism `kind` plus numeric `params`.
// The JSON shape is pinned to crates/sim-core `RawEffect` (07 §1a/§2).
//
// `trigger` is the optional match-context gate on the *whole* effect (03 §2.1
// vector 3, 07 §2.6). It is omitted for `Always`, so a trigger-free payload is
// byte-identical to the pre-OW-P03 shape; the engine's `RawEffect` defaults it
// to "unconditional".
type RawEffect struct {
	Kind    string             `json:"kind"`
	Params  map[string]float64 `json:"params,omitempty"`
	Trigger *RawTrigger        `json:"trigger,omitempty"`
}

// RawTrigger is the sim-core trigger wire shape (crates/sim-core `RawTrigger`).
// `when` is a snake id from the `TriggerWhen` set; `threshold` is read only by
// the threshold triggers.
type RawTrigger struct {
	When      string  `json:"when"`
	Threshold float64 `json:"threshold,omitempty"`
}

// EquippedTrait is a trait at a rarity, as stored in PlayerTraits.
type EquippedTrait struct {
	Trait  Trait
	Rarity Rarity
}

// AbilityEffect converts one ability to its sim-core payload. An ability whose
// Effect has no declared mechanism (SimKind == "") is skipped by EffectsFor. A
// non-`Always` trigger rides along so the engine gates the effect's activation.
func AbilityEffect(a Ability) RawEffect {
	e := RawEffect{Kind: a.Effect.SimKind(), Params: copyParams(a.Params)}
	if t, ok := abilityTrigger(a); ok {
		e.Trigger = &t
	}
	return e
}

// abilityTrigger reports the wire trigger for an ability, or ok=false when the
// ability is ungated (`Always`/empty) so the field is omitted entirely.
func abilityTrigger(a Ability) (RawTrigger, bool) {
	if a.Trigger == "" || a.Trigger == Always {
		return RawTrigger{}, false
	}
	return RawTrigger{When: string(a.Trigger), Threshold: a.TriggerThreshold}, true
}

// TraitEffect converts one equipped trait to its sim-core payload, scaling every
// numeric param by the rarity multiplier.
func TraitEffect(t EquippedTrait) RawEffect {
	mult := RarityMultiplier(t.Rarity)
	params := make(map[string]float64, len(t.Trait.Params))
	for k, v := range t.Trait.Params {
		params[k] = v * mult
	}
	return RawEffect{Kind: t.Trait.Effect.SimKind(), Params: params}
}

// EffectsFor is the deterministic sim payload for a player's slotted abilities
// and equipped traits. Order is canonical (by id within each group, abilities
// first, traits second) so the payload is byte-stable across runs and machines;
// sim-core applies effects additively so order does not change the outcome.
func EffectsFor(slotted []Ability, traits []EquippedTrait) []RawEffect {
	sortedAbilities := make([]Ability, len(slotted))
	copy(sortedAbilities, slotted)
	sort.Slice(sortedAbilities, func(i, j int) bool { return sortedAbilities[i].ID < sortedAbilities[j].ID })

	sortedTraits := make([]EquippedTrait, len(traits))
	copy(sortedTraits, traits)
	sort.Slice(sortedTraits, func(i, j int) bool { return sortedTraits[i].Trait.ID < sortedTraits[j].Trait.ID })

	out := make([]RawEffect, 0, len(sortedAbilities)+len(sortedTraits))
	for _, a := range sortedAbilities {
		if e := AbilityEffect(a); e.Kind != "" {
			out = append(out, e)
		}
	}
	for _, t := range sortedTraits {
		if e := TraitEffect(t); e.Kind != "" {
			out = append(out, e)
		}
	}
	return out
}

func copyParams(in map[string]float64) map[string]float64 {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]float64, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}
