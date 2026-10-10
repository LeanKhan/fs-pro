// Package association is the Associations core (docs/coc-mapping/02 §G, 04):
// member cap, loans, the Derby result rule, association levels, and the Festival
// Weekend window (CoC raid weekend: Fri 07:00 UTC -> Mon 07:00 UTC). Pure so the
// rules are table-testable.
package association

import "time"

// MaxMembers is the association size cap (CoC clans hold 50).
const MaxMembers = 50

// Result is a Derby outcome from the home association's perspective.
type Result int

// The Derby outcomes.
const (
	Draw Result = 0
	Home Result = 1
	Away Result = -1
)

// DerbyResult decides a Derby tie: more stars wins; equal stars are broken by
// greater destruction percentage (02 §G).
func DerbyResult(homeStars, awayStars, homeDestruction, awayDestruction int) Result {
	if homeStars != awayStars {
		if homeStars > awayStars {
			return Home
		}
		return Away
	}
	if homeDestruction != awayDestruction {
		if homeDestruction > awayDestruction {
			return Home
		}
		return Away
	}
	return Draw
}

// LoanSlots is how many players an association may have on loan at once, by
// association level (1..). Content - tunable.
func LoanSlots(level int) int {
	if level < 1 {
		level = 1
	}
	return 2 + level
}

// AssociationPerk is the passive bonus an association level grants.
type Perk struct {
	VaultBonusPct  int
	IncomeBonusPct int
}

// PerksForLevel is the perk profile for an association level.
func PerksForLevel(level int) Perk {
	if level < 1 {
		level = 1
	}
	return Perk{VaultBonusPct: 5 * level, IncomeBonusPct: 2 * level}
}

// FestivalActive reports whether the Festival Weekend is open (Friday 07:00 UTC
// inclusive to Monday 07:00 UTC exclusive).
func FestivalActive(now time.Time) bool {
	t := now.UTC()
	switch t.Weekday() {
	case time.Friday:
		return t.Hour() >= 7
	case time.Saturday, time.Sunday:
		return true
	case time.Monday:
		return t.Hour() < 7
	default:
		return false
	}
}
