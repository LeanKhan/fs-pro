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

// The perk kinds. Only Resource is redeemable today; construction/research/
// combat/cosmetic perks slot into the same consume path without schema changes.
const (
	PerkResource PerkKind = "resource"
)

// PerkDef is one redeemable Board Perk.
type PerkDef struct {
	Key      string
	Name     string
	Kind     PerkKind
	Currency Currency // PerkResource: the currency granted
	Amount   float64
}

// perkOrder is the deterministic read/iteration order (Go map order is random).
var perkOrder = []string{"cash_cache", "fan_cache", "talent_cache"}

// Perks is the consumable registry. Content/tunable (04 §7).
var Perks = map[string]PerkDef{
	"cash_cache":   {"cash_cache", "Cash Cache", PerkResource, Cash, 250000},
	"fan_cache":    {"fan_cache", "Fan Cache", PerkResource, Fans, 250000},
	"talent_cache": {"talent_cache", "Talent Cache", PerkResource, ScoutTokens, 2500},
}

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
