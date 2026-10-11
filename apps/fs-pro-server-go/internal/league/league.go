// Package league is the Standing ladder core (docs/coc-mapping/04 §4): leagues,
// their loot multipliers, the Standing change for a raid result, the weekly
// tournament pools (promotion/relegation), and the Form Bonus. Pure so the rules
// are table-testable; the world-worker wires the rollover to Postgres.
package league

// League is one rung of the Standing ladder.
type League struct {
	Name       string
	Division   int // 1..3, or 0 for the single-division apex / unranked
	LowerBound int // minimum Standing Points to be placed here
	Multiplier float64
}

// Unranked is below the lowest league; it earns no bonus.
var Unranked = League{Name: "Unranked", Division: 0, LowerBound: 0, Multiplier: 1.0}

// Leagues is the ladder in ascending order (CoC Bronze..Legend, 3 divisions each
// except Legend). Bounds and multipliers are content - tunable.
var Leagues = []League{
	{"Bronze", 3, 400, 1.0},
	{"Bronze", 2, 500, 1.05},
	{"Bronze", 1, 600, 1.1},
	{"Silver", 3, 800, 1.15},
	{"Silver", 2, 900, 1.2},
	{"Silver", 1, 1000, 1.25},
	{"Gold", 3, 1200, 1.3},
	{"Gold", 2, 1300, 1.35},
	{"Gold", 1, 1400, 1.4},
	{"Crystal", 3, 1600, 1.45},
	{"Crystal", 2, 1700, 1.5},
	{"Crystal", 1, 1800, 1.55},
	{"Master", 3, 2000, 1.6},
	{"Master", 2, 2100, 1.65},
	{"Master", 1, 2200, 1.7},
	{"Champion", 3, 2400, 1.75},
	{"Champion", 2, 2500, 1.8},
	{"Champion", 1, 2600, 1.85},
	{"Titan", 3, 2800, 1.9},
	{"Titan", 2, 2900, 1.95},
	{"Titan", 1, 3000, 2.0},
	{"Legend", 0, 3200, 2.1},
}

// LeagueFor is the league a Standing total falls in.
func LeagueFor(points int) League {
	got := Unranked
	for _, l := range Leagues {
		if points >= l.LowerBound {
			got = l
		} else {
			break
		}
	}
	return got
}

// LeagueIndex is the index into Leagues (0 = Bronze III), or -1 when unranked.
func LeagueIndex(points int) int {
	idx := -1
	for i, l := range Leagues {
		if points >= l.LowerBound {
			idx = i
		} else {
			break
		}
	}
	return idx
}

// Attack allowance bounds (04 §4.3): 6 at the lowest rung, capped at 30. The
// shipped 22-rung ladder tops out at 27 (Legend is single-division); the 30 cap
// is the contract for any future/extra rungs.
const (
	baseAttacksPerPool = 6
	maxAttacksPerPool  = 30
)

// AttacksPerPool is the weekly attack allowance for a league index: 6 at the
// lowest rung, scaling +1 per rung, capped at 30 (04 §4.3).
func AttacksPerPool(leagueIndex int) int {
	if leagueIndex < 0 {
		return baseAttacksPerPool
	}
	// Clamp the *index* before the addition so an out-of-range index (including
	// an adversarial near-MaxInt value) cannot overflow the arithmetic.
	if leagueIndex > maxAttacksPerPool-baseAttacksPerPool {
		return maxAttacksPerPool
	}
	return baseAttacksPerPool + leagueIndex
}

// PromoteRelegate splits a weekly pool into promoted and relegated clubs
// (10% each, min 1 when the pool is large enough to place).
func PromoteRelegate(poolSize int) (int, int) {
	n := poolSize / 10
	return n, n
}

// Star standing changes: a loss, a draw/narrow win, a clear win, a dominant win.
var starDelta = [4]int{-30, 10, 24, 32}

// StandingDelta is the Standing change for a raid result. Beating a stronger club
// is worth more and losing to a weaker one costs more; a loss to a stronger club
// costs less (04 §4.1).
func StandingDelta(myPoints, oppPoints, stars int) int {
	if stars < 0 {
		stars = 0
	}
	if stars > 3 {
		stars = 3
	}
	adj := (oppPoints - myPoints) / 50
	if adj > 8 {
		adj = 8
	}
	if adj < -8 {
		adj = -8
	}
	return starDelta[stars] + adj
}

// FormBonusReady reports whether the ~24h Form Bonus is earned (5 stars).
func FormBonusReady(stars int) bool {
	return stars >= 5
}
