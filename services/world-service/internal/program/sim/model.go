// Package sim is the balance simulator (OWNER-PROGRAM-SPEC.md §14, R13). It
// runs scripted owner strategies over seeded runs at a starting balance and
// reports time-to-Level-1, recovery, soft-locks and the final squad/Tiers.
//
// It uses the real spec cost/reward tables and a match-outcome distribution
// sampled from sim-lab output (see testdata/sim-lab-quality-10000.txt), never
// invented numbers. Every run is a pure function of (seed, run index).
package sim

import "math"

// ---------------------------------------------------------------------------
// Cost and reward tables (OWNER-PROGRAM-SPEC.md §3.2, §5.2–§5.4)
// ---------------------------------------------------------------------------

// consts mirror the frozen spec tables.
const (
	MatchXpWin  = 30
	MatchXpDraw = 10
	MatchXpLoss = 5
	Level1Xp    = 100

	ProgramXpCap = 54

	InterviewFee = 25_000
	ScoutFee     = 15_000

	// Game-time knobs (contract §8.3). 4A tunes these.
	MatchCooldownMinutes     = 5.0
	MatchWatchMinutes        = 2.0
	ManagerInteractionMin    = 12.0
	PlayersInteractionMin    = 20.0
	FacilitiesInteractionMin = 8.0
	RecoveryMinutes          = 60.0

	// Board advance (spec §15 Q4).
	BoardAdvanceCash = 250_000
	BoardAdvanceFee  = 50_000

	// Sale recovery: fraction of value returned.
	SaleRecovery = 0.70

	// A run that cannot reach Level 1 within this many qualifying friendlies
	// is soft-locked.
	RunMatchCap = 60
)

// ratingBand is a free-agent rating band and its base Villa value.
type ratingBand struct {
	lo, hi, base float64
}

// priceBands is the spec §5.2 base price table.
var priceBands = []ratingBand{
	{45, 49, 25_000},
	{50, 54, 55_000},
	{55, 59, 120_000},
	{60, 64, 320_000},
	{65, 69, 750_000},
	{70, 74, 1_600_000},
	{75, 79, 3_200_000},
	{80, 84, 6_500_000},
	{85, 100, 12_000_000},
}

// ageBand is an age multiplier band (spec §5.2).
type ageBand struct {
	lo, hi int
	mult   float64
}

var ageBands = []ageBand{
	{0, 20, 1.30},
	{21, 24, 1.20},
	{25, 28, 1.00},
	{29, 31, 0.75},
	{32, 34, 0.50},
	{35, 100, 0.30},
}

// FreeAgentValue is the spec §5.2 curve: round(base(rating) * ageMult).
func FreeAgentValue(rating, age int) float64 {
	base := priceBands[len(priceBands)-1].base
	for _, b := range priceBands {
		if float64(rating) >= b.lo && float64(rating) <= b.hi {
			base = b.base
			break
		}
	}
	mult := ageBands[len(ageBands)-1].mult
	for _, b := range ageBands {
		if age >= b.lo && age <= b.hi {
			mult = b.mult
			break
		}
	}
	return math.Round(base * mult)
}

// PlayerWage is WAGE_RATIO = 0.15 of value (utils/players.ts:46).
func PlayerWage(value float64) float64 { return math.Round(value * 0.15) }

// ManagerFeeBands is the spec §5.3 fee table.
var ManagerFeeBands = []ratingBand{
	{45, 49, 40_000},
	{50, 54, 90_000},
	{55, 59, 180_000},
	{60, 64, 360_000},
	{65, 69, 650_000},
	{70, 74, 1_100_000},
	{75, 100, 2_000_000},
}

// ManagerFee returns the signing fee for an overall rating.
func ManagerFee(overall int) float64 {
	fee := ManagerFeeBands[len(ManagerFeeBands)-1].base
	for _, b := range ManagerFeeBands {
		if float64(overall) >= b.lo && float64(overall) <= b.hi {
			fee = b.base
			break
		}
	}
	return fee
}

// ManagerWage is round(fee * 0.05) per Year.
func ManagerWage(fee float64) float64 { return math.Round(fee * 0.05) }

// FacilityBaseCost is upgradeCost(type, 1) = baseCost from asset-config.ts:64.
var FacilityBaseCost = map[string]float64{
	"stadium_grounds": 250_000,
	"stands":          300_000,
	"training_ground": 200_000,
	"youth_academy":   350_000,
	"scouting":        220_000,
	"medical_centre":  260_000,
	"staff_house":     300_000,
}

// FacilityBaseMinutes is upgradeMinutes(type, 1) at GAME_TIME_SCALE=1.
var FacilityBaseMinutes = map[string]float64{
	"stadium_grounds": 20,
	"stands":          30,
	"training_ground": 20,
	"youth_academy":   40,
	"scouting":        25,
	"medical_centre":  25,
	"staff_house":     35,
}

// CheapestFacility returns the cheapest Tier-1 facility type and its cost.
func CheapestFacility() (string, float64) {
	best := ""
	bestCost := math.MaxFloat64
	for _, t := range []string{"training_ground", "scouting", "stadium_grounds", "medical_centre", "stands", "staff_house", "youth_academy"} {
		if c := FacilityBaseCost[t]; c < bestCost {
			best, bestCost = t, c
		}
	}
	return best, bestCost
}

// ---------------------------------------------------------------------------
// Pool histograms (spec §6.1)
// ---------------------------------------------------------------------------

type band struct {
	lo, hi float64
	weight float64
}

var ratingHistogram = []band{
	{45, 49, 12.0},
	{50, 54, 22.0},
	{55, 59, 26.0},
	{60, 64, 20.0},
	{65, 69, 12.0},
	{70, 74, 5.0},
	{75, 79, 2.5},
	{80, 84, 0.4},
	{85, 92, 0.1},
}

var ageHistogram = []band{
	{16, 20, 12.0},
	{21, 24, 20.0},
	{25, 28, 22.0},
	{29, 31, 16.0},
	{32, 34, 12.0},
	{35, 36, 16.0},
}

var managerHistogram = []band{
	{45, 49, 14.0},
	{50, 54, 24.0},
	{55, 59, 27.0},
	{60, 64, 17.0},
	{65, 69, 11.0},
	{70, 74, 5.0},
	{75, 80, 2.0},
}

// Position shares (spec §6.1): GK 10, DEF 34, MID 34, ATT 22.
var positionShares = []struct {
	pos    string
	weight float64
}{
	{"GK", 10}, {"DEF", 34}, {"MID", 34}, {"ATT", 22},
}

// ---------------------------------------------------------------------------
// Match-outcome model (contract §8.4; sampled from sim-lab, not invented)
// ---------------------------------------------------------------------------

// outcomeBand is one row of the sim-lab outcome table: at the band's midpoint
// rating gap, the stronger side (or, at gap 0, the home side) wins/draws/loses
// with these probabilities.
type outcomeBand struct {
	mid           float64
	strongerWins  float64
	draw          float64
	strongerLoses float64
}

// Sourced from sim-lab (testdata/sim-lab-*-10000.txt):
//
//	realism:  home W/D/L 44/24/31 (the owner is always home, play.service.ts:296)
//	quality:  gap  3-8  -> stronger wins 56% draw 27% upset 17%
//	          gap  8-15 -> stronger wins 83% draw 12% upset  5%
//	          gap 15-100-> stronger wins 96% draw  3% upset  1%
//
// The gap-0 point is the home-even baseline from realism; the higher bands are
// the neutral quality table (home advantage washed out by the mixed fixtures).
var outcomeBands = []outcomeBand{
	{0.0, 0.44, 0.24, 0.31},
	{5.5, 0.56, 0.27, 0.17},
	{11.5, 0.83, 0.12, 0.05},
	{20.0, 0.96, 0.03, 0.01},
}

// OutcomeProb returns (pWin, pDraw, pLoss) for a rating gap (own − opponent),
// interpolating the sim-lab bands and mirroring when the gap is negative.
func OutcomeProb(gap float64) (float64, float64, float64) {
	ag := math.Abs(gap)
	w, d, l := interpolateBand(ag)
	if gap >= 0 {
		return w, d, l
	}
	return l, d, w
}

func interpolateBand(ag float64) (float64, float64, float64) {
	if ag <= outcomeBands[0].mid {
		b := outcomeBands[0]
		return b.strongerWins, b.draw, b.strongerLoses
	}
	last := outcomeBands[len(outcomeBands)-1]
	if ag >= last.mid {
		return last.strongerWins, last.draw, last.strongerLoses
	}
	for i := 0; i+1 < len(outcomeBands); i++ {
		a, b := outcomeBands[i], outcomeBands[i+1]
		if ag >= a.mid && ag <= b.mid {
			t := (ag - a.mid) / (b.mid - a.mid)
			return lerp(a.strongerWins, b.strongerWins, t),
				lerp(a.draw, b.draw, t),
				lerp(a.strongerLoses, b.strongerLoses, t)
		}
	}
	return last.strongerWins, last.draw, last.strongerLoses
}

func lerp(a, b, t float64) float64 { return a + (b-a)*t }
