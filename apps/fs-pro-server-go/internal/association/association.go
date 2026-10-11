// Package association is the Associations core (docs/coc-mapping/02 §G, 04):
// member cap, roles, loans, the Derby result rule, association levels/perks,
// the Association League bracket, weekly Directives, and the Association
// Grounds + Festival Weekend window (CoC raid weekend: Fri 07:00 UTC ->
// Mon 07:00 UTC).
//
// association.go is the pure, table-testable rule set. repository.go and the
// per-domain files (loans.go, derby.go, league.go, directives.go, grounds.go)
// wire those rules to Postgres; handlers.go/router.go expose the HTTP surface.
// Nothing here touches the database or the clock beyond its arguments.
package association

import (
	"fmt"
	"math"
	"sort"
	"time"
)

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

// Role is an association member's permission tier (02 §G: member/elder/leader).
type Role string

// The association roles.
const (
	RoleMember Role = "member"
	RoleElder  Role = "elder"
	RoleLeader Role = "leader"
)

// ValidRole reports whether r is one of the three defined roles.
func ValidRole(r Role) bool {
	switch r {
	case RoleMember, RoleElder, RoleLeader:
		return true
	default:
		return false
	}
}

// CanManage reports whether a role may run shared association actions (loans,
// grounds contributions, directive seeding).
func CanManage(r Role) bool { return r == RoleLeader || r == RoleElder }

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

// XpPerLevelStep is the XP a level-1 association needs to reach level 2
// (tunable). Levels use a triangular curve so later levels cost more.
const XpPerLevelStep = 1000

// XpForLevel is the cumulative XP needed to reach `level` (level 1 = 0 XP).
func XpForLevel(level int) int {
	if level < 1 {
		level = 1
	}
	return XpPerLevelStep * level * (level - 1) / 2
}

// LevelForXp is the highest association level `xp` has reached.
func LevelForXp(xp int) int {
	if xp < 0 {
		xp = 0
	}
	level := 1
	for XpForLevel(level+1) <= xp {
		level++
	}
	return level
}

// Phase is a Derby's lifecycle stage (02 §G, matching the contract enum).
type Phase string

// The Derby phases.
const (
	PhasePrep     Phase = "prep"
	PhaseBattle   Phase = "battle"
	PhaseComplete Phase = "complete"
)

// PhaseAt derives a Derby's phase from its absolute UTC schedule. The battle
// window is [battleStarts, ends); before it the Derby is in prep, and at or
// after `ends` it is complete.
func PhaseAt(now, prepStarts, battleStarts, ends time.Time) Phase {
	_ = prepStarts // scheduled start; prep covers everything before the battle
	switch {
	case !now.Before(ends):
		return PhaseComplete
	case !now.Before(battleStarts):
		return PhaseBattle
	default:
		return PhasePrep
	}
}

// DerbyAttemptsPerClub is how many attacks each club may make in one Derby
// (CoC Clan Wars gives two attacks; tunable).
const DerbyAttemptsPerClub = 2

// CanAttempt reports whether a club that has already resolved `resolved`
// attempts may make another.
func CanAttempt(resolved int) bool { return resolved >= 0 && resolved < DerbyAttemptsPerClub }

// DerbyMatch is one resolved Derby attack (a DerbyMatches row, reduced to the
// fields the aggregate needs).
type DerbyMatch struct {
	AttackerClubID string
	Stars          int
	Destruction    float64
}

// DerbyAggregate is the running score of a Derby: total stars per side and the
// mean destruction percentage of that side's resolved attacks (02 §G).
type DerbyAggregate struct {
	HomeStars       int
	AwayStars       int
	HomeDestruction float64
	AwayDestruction float64
}

// AggregateDerby sums stars and averages destruction per side. homeSide is the
// set of club ids on the Derby's home association.
func AggregateDerby(homeSide map[string]bool, matches []DerbyMatch) DerbyAggregate {
	var agg DerbyAggregate
	var homeSum, awaySum float64
	var homeN, awayN int
	for _, m := range matches {
		if homeSide[m.AttackerClubID] {
			agg.HomeStars += m.Stars
			homeSum += m.Destruction
			homeN++
		} else {
			agg.AwayStars += m.Stars
			awaySum += m.Destruction
			awayN++
		}
	}
	if homeN > 0 {
		agg.HomeDestruction = homeSum / float64(homeN)
	}
	if awayN > 0 {
		agg.AwayDestruction = awaySum / float64(awayN)
	}
	return agg
}

// DecideDerby applies the audited DerbyResult tiebreak to an aggregate. The
// destruction tiebreak compares the rounded percentages.
func DecideDerby(a DerbyAggregate) Result {
	return DerbyResult(a.HomeStars, a.AwayStars,
		int(math.Round(a.HomeDestruction)), int(math.Round(a.AwayDestruction)))
}

// DerbyReward is the Board-Vault gold the winner banks for a Derby (04 §5.3).
// A practice Derby (02 §D2 Friendly Derby) and a draw pay nothing.
func DerbyReward(result Result, practice bool, totalStars int) int {
	if practice || result == Draw {
		return 0
	}
	reward := 1000 + 250*totalStars
	if reward > 10000 {
		reward = 10000
	}
	return reward
}

// LeagueGroupSize is the number of associations in one Association League
// bracket (02 §G: a bracket of 8).
const LeagueGroupSize = 8

// LeaguePromote is how many associations promote out of each bracket.
const LeaguePromote = 2

// LeagueRelegate is how many associations relegate out of each bracket.
const LeagueRelegate = 2

// LeagueStanding is one association's line in a bracket.
type LeagueStanding struct {
	AssociationID string
	Stars         int
	GroupIndex    int
}

// RankGroup orders a bracket by stars (descending), breaking ties by
// association id so the order is deterministic.
func RankGroup(in []LeagueStanding) []LeagueStanding {
	out := append([]LeagueStanding(nil), in...)
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Stars != out[j].Stars {
			return out[i].Stars > out[j].Stars
		}
		return out[i].AssociationID < out[j].AssociationID
	})
	return out
}

// GroupIndexFor is the bracket index for the i-th seeded association.
func GroupIndexFor(i int) int {
	if i < 0 {
		return 0
	}
	return i / LeagueGroupSize
}

// Promoted reports whether a 1-based placement is in the promotion zone.
func Promoted(placement int) bool { return placement >= 1 && placement <= LeaguePromote }

// Relegated reports whether a 1-based placement is in the relegation zone. A
// bracket too small to relegate two safely relegates nobody.
func Relegated(placement, groupSize int) bool {
	if groupSize <= 2*LeagueRelegate {
		return false
	}
	return placement > groupSize-LeagueRelegate
}

// CanClaimTier is the once-per-member-per-tier directive rule (02 §G, 04 §7):
// a member may claim tier `tier` only after reaching the goal and only while
// their recorded ClaimedTier is behind it.
func CanClaimTier(progress, goal, claimedTier, tier int) bool {
	if tier < 1 || tier <= claimedTier {
		return false
	}
	return progress >= goal
}

// WeeklyKey is the ISO-8601 year-week key (e.g. "2026-W41") used to scope a
// week's Directives.
func WeeklyKey(now time.Time) string {
	year, week := now.UTC().ISOWeek()
	return fmt.Sprintf("%04d-W%02d", year, week)
}

// FestivalActive reports whether the Festival Weekend is open (Friday 07:00 UTC
// inclusive to Monday 07:00 UTC exclusive).
func FestivalActive(now time.Time) bool {
	open, close := FestivalWindow(now)
	return !now.Before(open) && now.Before(close)
}

// FestivalWindow returns the Fri 07:00 UTC -> Mon 07:00 UTC window that is open
// at `now`, or the next one when the Festival is closed. Both instants are UTC.
func FestivalWindow(now time.Time) (open, close time.Time) {
	t := now.UTC()
	// Most recent Friday 07:00 UTC at or before now.
	delta := (int(t.Weekday()) - int(time.Friday) + 7) % 7
	open = time.Date(t.Year(), t.Month(), t.Day(), 7, 0, 0, 0, time.UTC).AddDate(0, 0, -delta)
	if open.After(t) {
		open = open.AddDate(0, 0, -7)
	}
	close = open.AddDate(0, 0, 3)
	if !t.Before(close) {
		open = open.AddDate(0, 0, 7)
		close = open.AddDate(0, 0, 3)
	}
	return open, close
}

// GroundsMaxLevel is the top level of the co-op Association Grounds (02 §G).
const GroundsMaxLevel = 10

// GroundsUpgradeCost is the Capital Gold a co-op build needs to move the
// Grounds from `level` to `level+1` (tunable). It returns 0 at the cap.
func GroundsUpgradeCost(level int) int {
	if level < 1 {
		level = 1
	}
	if level >= GroundsMaxLevel {
		return 0
	}
	return 500 * level
}
