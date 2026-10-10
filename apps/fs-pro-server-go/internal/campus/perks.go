package campus

// Board Perks (04 §7): the "magic item" analogue. In the campus economy they
// are quick consumable counters stored on Clubs.Perks (04 §10) - a jsonb map of
// perk key -> remaining count. campus.usePerk redeems one: it decrements the
// counter and applies the perk's effect in one ledgered transaction.
//
// A redemption is idempotent per perk instance: the caller supplies an
// instanceId and a (ClubId, InstanceId) guard row makes a retried request a
// no-op. This is the redeem path for perks earned from Season Objectives,
// Association Directives, Festival Weekend and Honours (04 §7); granting stays
// decoupled, so this file only defines the consumable set and the rules.

// PerkKind is the family of a Board Perk (04 §7).
type PerkKind string

// The five perk kinds. Resource grants a currency; Construction and Research
// act on a running ClubAssets upgrade; Combat and Cosmetic are recorded
// redemptions with no durable state in this scope.
const (
	PerkResource     PerkKind = "resource"
	PerkConstruction PerkKind = "construction"
	PerkResearch     PerkKind = "research"
	PerkCombat       PerkKind = "combat"
	PerkCosmetic     PerkKind = "cosmetic"
)

// PerkDef is one redeemable Board Perk.
type PerkDef struct {
	Key      string
	Name     string
	Kind     PerkKind
	Currency Currency // PerkResource: the currency granted
	Amount   float64  // PerkResource: how much of Currency is granted
	Minutes  float64  // PerkConstruction builder_boost: build minutes removed
}

// perkOrder is the deterministic read/iteration order (Go map order is random).
var perkOrder = []string{
	"cash_cache", "fan_cache", "talent_cache",
	"resource_cache", "instant_finish", "builder_boost", "research_finish",
	"trait_trial", "regalia",
}

// Perks is the consumable registry. Content/tunable (04 §7). The keys are the
// Board-Perk ids the reward paths grant (seasonpass.Perk*, Honour rewards,
// Association Directive rewards), so a grant and a redemption always agree on
// the same key.
var Perks = map[string]PerkDef{
	// Resource caches: an instant currency grant.
	"cash_cache":     {Key: "cash_cache", Name: "Cash Cache", Kind: PerkResource, Currency: Cash, Amount: 250000},
	"fan_cache":      {Key: "fan_cache", Name: "Fan Cache", Kind: PerkResource, Currency: Fans, Amount: 250000},
	"talent_cache":   {Key: "talent_cache", Name: "Talent Cache", Kind: PerkResource, Currency: ScoutTokens, Amount: 2500},
	"resource_cache": {Key: "resource_cache", Name: "Resource Cache", Kind: PerkResource, Currency: Cash, Amount: 250000},
	// Construction: finish (or accelerate) a running campus upgrade.
	"instant_finish": {Key: "instant_finish", Name: "Instant Finish", Kind: PerkConstruction},
	"builder_boost":  {Key: "builder_boost", Name: "Builder Boost", Kind: PerkConstruction, Minutes: 60},
	// Research: finish a running Coaching Department / Video Analysis upgrade.
	"research_finish": {Key: "research_finish", Name: "Research Finish", Kind: PerkResearch},
	// Combat / Cosmetic: recorded redemptions with no durable state here.
	"trait_trial": {Key: "trait_trial", Name: "Trait Trial", Kind: PerkCombat},
	"regalia":     {Key: "regalia", Name: "Club Regalia", Kind: PerkCosmetic},
}

// ResearchFacilities are the upgrade targets a Research perk may finish (04 §7
// "instant ability/coaching finish"); internal/abilities reads these levels.
var ResearchFacilities = map[string]bool{"coaching_dept": true, "video_analysis": true}

// IsResearchFacility reports whether a facility key is a research tile.
func IsResearchFacility(key string) bool { return ResearchFacilities[key] }

// PerkDefFor resolves a perk key.
func PerkDefFor(key string) (PerkDef, bool) {
	def, ok := Perks[key]
	return def, ok
}

// PerkKeys returns the registry keys in deterministic order.
func PerkKeys() []string {
	out := make([]string, len(perkOrder))
	copy(out, perkOrder)
	return out
}

// PerkCount reads a perk's remaining count from a club's Perks document. A
// missing, malformed or negative entry reads as 0, so a corrupted counter can
// never be spent.
func PerkCount(perks map[string]any, key string) int {
	if perks == nil {
		return 0
	}
	var n int
	switch v := perks[key].(type) {
	case float64:
		n = int(v)
	case int:
		n = v
	case int64:
		n = int(v)
	default:
		return 0
	}
	if n < 0 {
		return 0
	}
	return n
}
