package abilities

// Traits are a Star Player's equippable modifiers (02 §C, the "Hero Equipment"
// analog): 2 slots, active or passive, upgraded across three rarity tiers with
// Trait Alloys (the "Ores" analog, Shiny/Glowy/Starry). Like the ability
// registry, this is data: the numbers arrive in the sim-core payload, the
// mechanisms are the shared EffectKinds.

// MaxTraitSlots is how many traits a Star Player may equip (02 §C: 2).
const MaxTraitSlots = 2

// Trait is one registry entry. Params are the effect numbers at the base
// (Shiny) rarity; a higher rarity scales them by RarityMultiplier.
type Trait struct {
	ID          string
	Name        string
	Description string
	Effect      EffectKind
	Params      map[string]float64
}

// Traits is the shipped trait catalogue, in canonical order.
var Traits = []Trait{
	{ID: "iron_wall", Name: "Iron Wall", Description: "Reads passing lanes and steps in to intercept.",
		Effect: EffectInterception, Params: map[string]float64{"bonus": 0.10, "lane": 1}},
	{ID: "aerial_threat", Name: "Aerial Threat", Description: "Wins the ball in the air more often.",
		Effect: EffectHeaderQuality, Params: map[string]float64{"bonus": 0.15}},
	{ID: "clean_striker", Name: "Clean Striker", Description: "Strikes the ball cleaner in the box.",
		Effect: EffectShotQuality, Params: map[string]float64{"bonus": 0.12}},
	{ID: "engine", Name: "Engine", Description: "Finds a second wind late in the match.",
		Effect: EffectStaminaSurge, Params: map[string]float64{"below": 30, "amount": 12}},
	{ID: "free_role", Name: "Free Role", Description: "Roams off the anchor and runs in behind.",
		Effect: EffectTendency, Params: map[string]float64{"roam": 0.15, "forward_runs": 0.10}},
}

// TraitByID resolves a trait entry.
func TraitByID(id string) (Trait, bool) {
	for _, t := range Traits {
		if t.ID == id {
			return t, true
		}
	}
	return Trait{}, false
}

// Rarity is a trait's alloy tier (the Ores analog, 02 §C).
type Rarity string

// The rarity tiers, cheapest first.
const (
	RarityShiny  Rarity = "shiny"
	RarityGlowy  Rarity = "glowy"
	RarityStarry Rarity = "starry"
)

// rarityOrder is the upgrade ladder; index is the tier.
var rarityOrder = []Rarity{RarityShiny, RarityGlowy, RarityStarry}

// Valid reports whether r names a rarity tier.
func (r Rarity) Valid() bool {
	for _, v := range rarityOrder {
		if r == v {
			return true
		}
	}
	return false
}

// NormalizeRarity returns r when valid, else Shiny (the starting tier), so a
// missing/forged rarity cannot escape the domain.
func NormalizeRarity(r Rarity) Rarity {
	if r.Valid() {
		return r
	}
	return RarityShiny
}

// RarityMultiplier scales a trait's effect params by rarity.
func RarityMultiplier(r Rarity) float64 {
	switch NormalizeRarity(r) {
	case RarityGlowy:
		return 1.25
	case RarityStarry:
		return 1.5
	default:
		return 1.0
	}
}

// NextRarity is the tier one upgrade above r; ok is false at the top.
func NextRarity(r Rarity) (Rarity, bool) {
	cur := NormalizeRarity(r)
	for i, v := range rarityOrder {
		if v == cur && i+1 < len(rarityOrder) {
			return rarityOrder[i+1], true
		}
	}
	return cur, false
}

// Alloys is a club's Trait Alloy balances (Clubs.TraitAlloys).
type Alloys struct {
	Shiny  int
	Glowy  int
	Starry int
}

// AlloyCost is the cost to upgrade a trait from `from` to the next rarity; ok is
// false at the top of the ladder. Content/tunable.
func AlloyCost(from Rarity) (Alloys, bool) {
	switch NormalizeRarity(from) {
	case RarityShiny:
		return Alloys{Shiny: 100}, true
	case RarityGlowy:
		return Alloys{Glowy: 60}, true
	default:
		return Alloys{}, false
	}
}

// Covers reports whether `have` can pay `cost`.
func (have Alloys) Covers(cost Alloys) bool {
	return have.Shiny >= cost.Shiny && have.Glowy >= cost.Glowy && have.Starry >= cost.Starry
}

// Minus returns have - cost (callers check Covers first).
func (have Alloys) Minus(cost Alloys) Alloys {
	return Alloys{
		Shiny:  have.Shiny - cost.Shiny,
		Glowy:  have.Glowy - cost.Glowy,
		Starry: have.Starry - cost.Starry,
	}
}
