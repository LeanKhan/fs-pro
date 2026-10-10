// Package clubhouse is the single authority for Clubhouse-tier progression
// (docs/coc-mapping/04 §1.1, §2). It answers every question of the form "what
// does Clubhouse tier N allow?":
//
//   - CapForTier - the CoC "Town Hall caps every building" rule: the highest
//     level a non-Clubhouse facility may reach at a tier, so a club cannot
//     mainline one building. This is the downward gate.
//   - Requirements/CanUpgrade - the prerequisite graph that gates the Clubhouse
//     itself (the upward gate).
//   - GroundskeepersForTier/EffectiveGroundskeepers/CountGroundskeepers - the
//     scarce build-slot count.
//   - SyncTier/SweepDueUpgrades - promoting a completed Clubhouse asset into
//     Clubs.ClubhouseTier.
//
// internal/campus and internal/facilities both delegate here, so the cap, the
// crew read and the tier sync each exist exactly once. This package is a leaf:
// it depends only on internal/db.
package clubhouse

// Caps and gates.
const (
	// MaxTier is the highest Clubhouse tier (CoC's top Town Hall level).
	MaxTier = 5
	// MaxGroundskeepers is the Club Legacy cap on simultaneous builds.
	MaxGroundskeepers = 6
	// MilestoneGroundskeepers is how many tiers grant one Groundskeeper each
	// (tiers 1..3); 4..6 are bought or earned through Club Legacy.
	MilestoneGroundskeepers = 3
)

// CapForTier is the highest level a non-Clubhouse facility may reach at a
// Clubhouse tier (04 §1.1: the Clubhouse "caps all of the above"). At tier 1
// every facility is capped at level 1, at tier 5 at level 5. The result is
// clamped so an out-of-range tier is safe. Both campus.upgrade and
// facilities.upgrade enforce this with the same function.
func CapForTier(tier int) int {
	return clamp(tier, 1, MaxTier)
}

// Requirement is a facility level needed to unlock something.
type Requirement struct {
	Facility string
	Level    int
}

// Requirements are the facility levels needed to upgrade the Clubhouse to
// `tier` (tier 1 is the start). Content - tunable without code changes.
func Requirements(tier int) []Requirement {
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

// Missing returns the requirements not yet met by `levels`. A nil map is safe:
// every requirement is reported missing.
func Missing(tier int, levels map[string]int) []Requirement {
	var missing []Requirement
	for _, r := range Requirements(tier) {
		if levels[r.Facility] < r.Level {
			missing = append(missing, r)
		}
	}
	return missing
}

// CanUpgrade reports whether the Clubhouse may reach `tier`, and which
// requirements are missing if not.
func CanUpgrade(tier int, levels map[string]int) (bool, []Requirement) {
	if tier <= 1 {
		return true, nil
	}
	if tier > MaxTier {
		return false, nil
	}
	missing := Missing(tier, levels)
	return len(missing) == 0, missing
}

// GroundskeepersForTier is the Groundskeepers earned from milestones alone
// (tier 1 -> 1, tier 2 -> 2, tier 3+ -> 3). Groundskeepers 4..6 are bought.
func GroundskeepersForTier(tier int) int {
	return clamp(tier, 1, MilestoneGroundskeepers)
}

// EffectiveGroundskeepers clamps a stored Groundskeeper count to the club's real
// entitlement: never below the milestone grant its tier earned, never above
// MaxGroundskeepers, never below one. This is the one rule every crew read uses.
func EffectiveGroundskeepers(stored, tier int) int {
	count := stored
	if grant := GroundskeepersForTier(tier); count < grant {
		count = grant
	}
	if count > MaxGroundskeepers {
		count = MaxGroundskeepers
	}
	if count < 1 {
		count = 1
	}
	return count
}

// CanStartUpgrade reports whether another construction can begin: each
// Groundskeeper runs exactly one upgrade (04 §2). The keeper count is clamped to
// MaxGroundskeepers so an inflated stored value cannot open extra slots.
func CanStartUpgrade(activeUpgrades, groundskeepers int) bool {
	if groundskeepers > MaxGroundskeepers {
		groundskeepers = MaxGroundskeepers
	}
	return activeUpgrades < groundskeepers
}

// GroundskeeperPrice is the Sponsor Credit price of the next Groundskeeper
// (04 §2): #4 and #5 are bought, #1..#3 are milestones and #6 is the Club
// Legacy chain. ok is false when the index is not purchasable.
func GroundskeeperPrice(n int) (price float64, ok bool) {
	switch n {
	case 4:
		return 500, true
	case 5:
		return 1000, true
	default:
		return 0, false
	}
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
