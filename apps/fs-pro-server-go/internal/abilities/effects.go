package abilities

import "sort"

// This file is the Go half of the Wave-1 handoff (07 §1a): the pure, typed
// payload sim-core consumes. sim-core implements a small fixed set of effect
// *kinds*; the registry supplies the numbers. `EffectsFor` resolves a player's
// slotted abilities and equipped traits into that payload once, at build time.

// RawEffect is one sim-core effect: a mechanism `kind` plus numeric `params`.
// The JSON shape is pinned to crates/sim-core `RawEffect` (07 §1a/§2).
type RawEffect struct {
	Kind   string             `json:"kind"`
	Params map[string]float64 `json:"params,omitempty"`
}

// EquippedTrait is a trait at a rarity, as stored in PlayerTraits.
type EquippedTrait struct {
	Trait  Trait
	Rarity Rarity
}

// AbilityEffect converts one ability to its sim-core payload. An ability whose
// Effect has no declared mechanism (SimKind == "") is skipped by EffectsFor.
func AbilityEffect(a Ability) RawEffect {
	return RawEffect{Kind: a.Effect.SimKind(), Params: copyParams(a.Params)}
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
