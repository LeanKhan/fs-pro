// Package campus is the campus economy core (docs/coc-mapping/04): the Clubhouse
// tier gate, Groundskeepers (the build-slot bottleneck), collectors, vaults and
// the crossed two-currency cost model. Pure so the rules are table-testable; the
// HTTP/storage layer wires these functions to Postgres.
package campus

import (
	"math"
	"time"
)

// Currency is a campus currency (04 §1).
type Currency string

// The currencies.
const (
	Cash           Currency = "cash"
	Fans           Currency = "fans"
	ScoutTokens    Currency = "scout_tokens"
	SponsorCredits Currency = "sponsor_credits"
)

// Caps and gates.
const (
	MaxClubhouseTier        = 5
	MaxGroundskeepers       = 6
	MilestoneGroundskeepers = 3 // tiers 1..3 grant one each; 4..6 are bought
)

// FacilityCurrency is what a facility upgrade costs. The two soft producers are
// crossed (04 §1.1): the Cash producer is upgraded with Fans and vice versa, so
// neither currency can be levelled alone.
var FacilityCurrency = map[string]Currency{
	"turnstiles":    Fans, // produces Cash
	"club_shop":     Cash, // produces Fans
	"cash_vault":    Fans,
	"fan_vault":     Cash,
	"clubhouse":     Cash,
	"academy":       Cash,
	"coaching_dept": Fans,
}

// GroundskeepersForTier is the Groundskeepers earned from milestones alone
// (tier 1 -> 1, tier 2 -> 2, tier 3+ -> 3). Groundskeepers 4..6 are bought.
func GroundskeepersForTier(tier int) int {
	if tier < 1 {
		tier = 1
	}
	if tier > MilestoneGroundskeepers {
		tier = MilestoneGroundskeepers
	}
	return tier
}

// CanStartUpgrade reports whether another construction can begin: each
// Groundskeeper runs exactly one upgrade (04 §2).
func CanStartUpgrade(activeUpgrades, groundskeepers int) bool {
	if groundskeepers > MaxGroundskeepers {
		groundskeepers = MaxGroundskeepers
	}
	return activeUpgrades < groundskeepers
}

// Collector is a passive income source: `RatePerHour` fills up to `Capacity`
// and then stops (L1).
type Collector struct {
	RatePerHour float64
	Capacity    float64
}

// Accrue is the lazy collector amount between `since` and `now`, clamped to the
// capacity. Nothing is written; the caller computes on read/write.
func Accrue(c Collector, since, now time.Time) float64 {
	hours := now.Sub(since).Hours()
	if hours <= 0 {
		return 0
	}
	v := c.RatePerHour * hours
	if v > c.Capacity {
		return c.Capacity
	}
	return v
}

// VaultCapacity is the storage cap for a vault level (level 0 = no vault).
func VaultCapacity(base, growth float64, level int) float64 {
	if level <= 0 {
		return 0
	}
	return base * math.Pow(growth, float64(level-1))
}

// UpgradeCost is the steep cost curve shared by campus facilities:
// base * growth^(level-1).
func UpgradeCost(base, growth float64, level int) float64 {
	if level <= 1 {
		return base
	}
	return base * math.Pow(growth, float64(level-1))
}

// Requirement is a facility level needed to unlock something.
type Requirement struct {
	Facility string
	Level    int
}

// ClubhouseRequirements are the facility levels needed to upgrade the Clubhouse
// to `tier` (tier 1 is the start). Content - tunable without code changes.
func ClubhouseRequirements(tier int) []Requirement {
	switch tier {
	case 2:
		return []Requirement{{"stands", 1}, {"training_ground", 1}}
	case 3:
		return []Requirement{{"stands", 2}, {"training_ground", 2}, {"youth_academy", 1}}
	case 4:
		return []Requirement{{"stadium_grounds", 2}, {"coaching_dept", 2}, {"medical_centre", 2}}
	case 5:
		return []Requirement{{"stadium_grounds", 3}, {"coaching_dept", 3}, {"youth_academy", 3}, {"scouting", 2}}
	default:
		return nil
	}
}

// MissingRequirements returns the requirements not yet met by `levels`.
func MissingRequirements(tier int, levels map[string]int) []Requirement {
	var missing []Requirement
	for _, r := range ClubhouseRequirements(tier) {
		if levels[r.Facility] < r.Level {
			missing = append(missing, r)
		}
	}
	return missing
}

// CanUpgradeClubhouse reports whether the Clubhouse may reach `tier`, and which
// requirements are missing if not.
func CanUpgradeClubhouse(tier int, levels map[string]int) (bool, []Requirement) {
	if tier <= 1 {
		return true, nil
	}
	if tier > MaxClubhouseTier {
		return false, nil
	}
	missing := MissingRequirements(tier, levels)
	return len(missing) == 0, missing
}
