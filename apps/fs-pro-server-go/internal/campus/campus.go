// Package campus is the campus economy core (docs/coc-mapping/04): the Clubhouse
// tier gate, Groundskeepers (the build-slot bottleneck), collectors, vaults and
// the crossed two-currency cost model. Pure so the rules are table-testable; the
// HTTP/storage layer wires these functions to Postgres.
//
// The Clubhouse-tier *rules* - the cap on other facilities, the prerequisite
// graph, the Groundskeeper count and the tier sync - live in internal/clubhouse,
// the single authority shared with internal/facilities. The exports below that
// delegate there are compatibility aliases; new code should import
// internal/clubhouse directly.
package campus

import (
	"math"
	"time"

	"fs-pro-server/internal/clubhouse"
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

// Compatibility aliases into internal/clubhouse (the authority).
const (
	MaxClubhouseTier        = clubhouse.MaxTier
	MaxGroundskeepers       = clubhouse.MaxGroundskeepers
	MilestoneGroundskeepers = clubhouse.MilestoneGroundskeepers
)

// FacilityCurrency is what a facility upgrade costs. The two soft producers are
// crossed (04 §1.1): the Cash producer is upgraded with Fans and vice versa, so
// neither currency can be levelled alone.
var FacilityCurrency = map[string]Currency{
	"turnstiles":     Fans, // produces Cash
	"club_shop":      Cash, // produces Fans
	"cash_vault":     Fans,
	"fan_vault":      Cash,
	"clubhouse":      Cash,
	"academy":        Cash,
	"coaching_dept":  Fans,
	"video_analysis": Fans, // research: unlocks the upper ability tiers
	// Campus facilities cost Cash (04 §1.1).
	"stands":          Cash,
	"stadium_grounds": Cash,
	"training_ground": Cash,
	"youth_academy":   Cash,
	"scouting":        Cash,
	"medical_centre":  Cash,
	"staff_house":     Cash,
}

// Requirement is a facility level needed to unlock something.
type Requirement = clubhouse.Requirement

// GroundskeepersForTier is the Groundskeepers earned from milestones alone.
func GroundskeepersForTier(tier int) int { return clubhouse.GroundskeepersForTier(tier) }

// CanStartUpgrade reports whether another construction can begin: each
// Groundskeeper runs exactly one upgrade (04 §2).
func CanStartUpgrade(activeUpgrades, groundskeepers int) bool {
	return clubhouse.CanStartUpgrade(activeUpgrades, groundskeepers)
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

// ClubhouseRequirements are the facility levels needed to upgrade the Clubhouse
// to `tier` (tier 1 is the start). Content - tunable without code changes.
func ClubhouseRequirements(tier int) []Requirement { return clubhouse.Requirements(tier) }

// MissingRequirements returns the requirements not yet met by `levels`.
func MissingRequirements(tier int, levels map[string]int) []Requirement {
	return clubhouse.Missing(tier, levels)
}

// CanUpgradeClubhouse reports whether the Clubhouse may reach `tier`, and which
// requirements are missing if not.
func CanUpgradeClubhouse(tier int, levels map[string]int) (bool, []Requirement) {
	return clubhouse.CanUpgrade(tier, levels)
}
