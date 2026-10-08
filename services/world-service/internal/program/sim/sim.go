package sim

import (
	"fmt"
	"math"
	"math/rand"
	"runtime"
	"sort"
	"sync"

	"fs-pro-world-service/internal/program"
)

// clubState is one simulated club's program run.
type clubState struct {
	startingBalance float64
	budget          float64
	pool            []Player // unsigned market
	squad           []Player
	manager         *Manager
	managerFeePaid  float64
	assets          map[string]int
	facilityType    string
	facilityMinutes float64
	clubXp          int
	wins            int
	draws           int
	losses          int
	matches         int
	recovery        int
	facilityBuilt   bool
	stars           map[program.Step]int
}

// RunResult is one run's outcome.
type RunResult struct {
	Reached     bool
	Minutes     float64
	Matches     int
	Wins        int
	Draws       int
	Losses      int
	StarTotal   int
	FinalRating float64
	FinalCash   float64
	FinalTiers  map[string]int
	Bankrupt    bool
	Recovery    int
	SoftLocked  bool
}

// friendlyCash is the spec §5.5 gate-share cash for a Level-0 friendly.
func friendlyCash(outcome string) float64 {
	const gateNet = 6_000.0
	switch outcome {
	case "win":
		return math.Max(math.Round(gateNet*0.5), 3_000)
	case "draw":
		return math.Round(gateNet * 0.1)
	default:
		return math.Round(gateNet * -0.15)
	}
}

// playFriendly plays one qualifying friendly against a sampled opponent.
func (c *clubState) playFriendly(rng *rand.Rand) {
	own := medianXI(c.squad)
	opp := opponentRating(own, rng)
	pw, pd, _ := OutcomeProb(own - opp)
	r := rng.Float64()
	switch {
	case r < pw:
		c.wins++
		c.clubXp += MatchXpWin
		c.budget += friendlyCash("win")
	case r < pw+pd:
		c.draws++
		c.clubXp += MatchXpDraw
		c.budget += friendlyCash("draw")
	default:
		c.losses++
		c.clubXp += MatchXpLoss
		c.budget += friendlyCash("loss")
	}
	c.matches++
}

// boardAdvance is the recovery path (spec §15 Q4): +cash for a fee, always
// available, but it costs real minutes.
func (c *clubState) boardAdvance() {
	c.budget += BoardAdvanceCash - BoardAdvanceFee
	c.recovery++
}

// sellSurplus sells the most valuable player beyond the legal XI for 70% value.
func (c *clubState) sellSurplus() bool {
	if len(c.squad) <= 11 {
		return false
	}
	idx := 0
	for i, p := range c.squad {
		if p.Value > c.squad[idx].Value {
			idx = i
		}
	}
	c.budget += math.Round(c.squad[idx].Value * SaleRecovery)
	c.squad = append(c.squad[:idx], c.squad[idx+1:]...)
	c.recovery++
	return true
}

// ensureSquad reaches a legal XI (≥11, ≥1 GK) using market signings, sales and
// the board advance.
func (c *clubState) ensureSquad() {
	for attempt := 0; attempt < 200; attempt++ {
		gk := posCount(c.squad, "GK")
		if len(c.squad) >= 11 && gk >= 1 {
			return
		}
		if c.signCheapestOne() {
			continue
		}
		if c.sellSurplus() {
			continue
		}
		c.boardAdvance()
	}
}

// signCheapestOne signs the cheapest market player (keeper first if missing).
func (c *clubState) signCheapestOne() bool {
	needGK := posCount(c.squad, "GK") == 0
	for _, p := range c.sortedByCost() {
		if needGK && p.Position != "GK" {
			continue
		}
		if _, ok := c.take(p.id); ok {
			return true
		}
	}
	return false
}

// buildFacility builds the strategy's facility, playing friendly income or
// taking a board advance when it cannot afford one.
func (c *clubState) buildFacility(strat Strategy, rng *rand.Rand) {
	typ := c.facilityChoice(strat, rng)
	if typ == "" {
		return
	}
	cost := FacilityBaseCost[typ]
	for c.budget < cost && c.matches < RunMatchCap/2 && len(c.squad) >= 11 && posCount(c.squad, "GK") >= 1 {
		c.playFriendly(rng)
	}
	if c.budget < cost {
		c.boardAdvance()
	}
	if c.budget >= cost {
		c.budget -= cost
		c.assets[typ] = 1
		c.facilityType = typ
		c.facilityMinutes = FacilityBaseMinutes[typ]
		c.facilityBuilt = true
	}
}

// chooseSquad implements each strategy's market approach.
func (c *clubState) chooseSquad(strat Strategy, rng *rand.Rand) {
	switch strat {
	case BalancedExpert:
		reserve := FacilityBaseCost["training_ground"] + 100_000
		avail := c.budget - reserve
		if avail < 220_000 {
			avail = c.budget - FacilityBaseCost["training_ground"]
		}
		if avail < 220_000 {
			avail = c.budget
		}
		c.signToShape(avail, map[string]int{"GK": 2, "DEF": 4, "MID": 4, "ATT": 3})
		// Spend whatever is left above the reserve on the best players, which
		// raises the median XI rating without breaking the shape.
		c.signBestSpend(reserve)
		if len(c.squad) < 11 {
			c.signCheapest(11)
		}
	case AllInOnPlayers:
		c.signBestSpend(50_000)
		if len(c.squad) < 11 {
			c.signCheapest(11)
		}
	case Random:
		c.randomSign(16, rng)
	case SplurgeOnManager, FacilitiesFirst:
		c.signCheapest(13)
	}
}

// runOne executes one deterministic program run.
func runOne(balance float64, strat Strategy, rng *rand.Rand) RunResult {
	c := &clubState{
		startingBalance: balance,
		budget:          balance,
		pool:            genPlayers(rng, 200),
		assets:          map[string]int{},
	}
	managers := genManagers(rng, 60)

	c.pickManager(strat, managers, rng)
	c.recordStar(program.StepManager)

	if strat == FacilitiesFirst {
		c.buildFacility(strat, rng)
		c.recordStar(program.StepFacilities)
		c.chooseSquad(strat, rng)
		c.ensureSquad()
		c.recordStar(program.StepPlayers)
	} else {
		c.chooseSquad(strat, rng)
		c.ensureSquad()
		c.recordStar(program.StepPlayers)
		c.buildFacility(strat, rng)
		c.recordStar(program.StepFacilities)
	}

	for c.clubXp < Level1Xp && c.matches < RunMatchCap {
		c.playFriendly(rng)
	}
	if !c.facilityBuilt {
		c.buildFacility(strat, rng)
		c.recordStar(program.StepFacilities)
	}

	res := RunResult{
		Wins:        c.wins,
		Draws:       c.draws,
		Losses:      c.losses,
		Matches:     c.matches,
		StarTotal:   c.starTotal(),
		FinalRating: medianXI(c.squad),
		FinalCash:   c.budget,
		FinalTiers:  map[string]int{},
		Recovery:    c.recovery,
	}
	for t, tier := range c.assets {
		res.FinalTiers[t] = tier
	}
	res.Reached = c.clubXp >= Level1Xp
	res.SoftLocked = !res.Reached
	res.Bankrupt = c.budget <= 0

	res.Minutes = level1Minutes(c.matches, c.facilityBuilt, c.facilityMinutes) +
		float64(c.recovery)*RecoveryMinutes
	return res
}

// level1Minutes is the session-time model (contract §8.3): interaction budget
// plus the longer of the facility build and the friendly cooldowns.
func level1Minutes(matches int, facilityBuilt bool, facilityMinutes float64) float64 {
	interactionEnd := ManagerInteractionMin + PlayersInteractionMin + FacilitiesInteractionMin
	matchEnd := interactionEnd
	if matches > 0 {
		matchEnd += float64(matches-1)*MatchCooldownMinutes + float64(matches)*MatchWatchMinutes
	}
	facilityEnd := interactionEnd
	if facilityBuilt {
		facilityEnd += facilityMinutes
	}
	return math.Max(matchEnd, facilityEnd)
}

// Percentiles is a small distribution summary.
type Percentiles struct {
	P10    float64 `json:"p10"`
	Median float64 `json:"median"`
	P90    float64 `json:"p90"`
	Mean   float64 `json:"mean"`
}

// SimulationReport is the POST /program/simulate response.
type SimulationReport struct {
	Balance          float64           `json:"balance"`
	Strategy         string            `json:"strategy"`
	Runs             int               `json:"runs"`
	Seed             int64             `json:"seed"`
	TimeToLevel1     Percentiles       `json:"timeToLevel1Minutes"`
	Matches          Percentiles       `json:"matches"`
	StarDistribution map[string]int    `json:"starDistribution"`
	FinalSquadRating Percentiles       `json:"finalSquadRating"`
	FinalCash        Percentiles       `json:"finalCash"`
	FinalTiers       map[string]int    `json:"finalTiers"`
	Bankrupt         int               `json:"bankrupt"`
	Recovery         int               `json:"recovery"`
	SoftLocked       int               `json:"softLocked"`
	Histogram        []HistogramBucket `json:"histogram"`
}

// HistogramBucket is one time-to-Level-1 bucket.
type HistogramBucket struct {
	Bucket string `json:"bucket"`
	Count  int    `json:"count"`
}

// Request is the validated POST /program/simulate input.
type Request struct {
	Balance  float64
	Strategy string
	Runs     int
	Seed     int64
}

// Validate enforces the contract constraints.
func (r Request) Validate() error {
	if r.Balance < 1_000_000 || r.Balance > 5_000_000 {
		return fmt.Errorf("balance must be between 1000000 and 5000000")
	}
	if _, ok := ParseStrategy(r.Strategy); !ok {
		return fmt.Errorf("strategy must be one of random, facilities_first, splurge_on_manager, all_in_on_players, balanced_expert")
	}
	if r.Runs < 1 || r.Runs > 100_000 {
		return fmt.Errorf("runs must be between 1 and 100000")
	}
	return nil
}

// Run executes the simulator and aggregates the report.
func Run(req Request) (SimulationReport, error) {
	if err := req.Validate(); err != nil {
		return SimulationReport{}, err
	}
	strat, _ := ParseStrategy(req.Strategy)
	results := runAll(req.Balance, strat, req.Runs, req.Seed)

	report := SimulationReport{
		Balance:          req.Balance,
		Strategy:         req.Strategy,
		Runs:             req.Runs,
		Seed:             req.Seed,
		StarDistribution: map[string]int{},
		FinalTiers:       map[string]int{},
	}
	var times, matchCounts, ratings, cash []float64
	tierSamples := map[string][]int{}
	for _, r := range results {
		if r.Bankrupt {
			report.Bankrupt++
		}
		if r.Recovery > 0 {
			report.Recovery++
		}
		if r.SoftLocked {
			report.SoftLocked++
			continue
		}
		times = append(times, r.Minutes)
		matchCounts = append(matchCounts, float64(r.Matches))
		ratings = append(ratings, r.FinalRating)
		cash = append(cash, r.FinalCash)
		report.StarDistribution[fmt.Sprintf("%d", r.StarTotal)]++
		for _, t := range facilityTypes {
			tierSamples[t] = append(tierSamples[t], r.FinalTiers[t])
		}
	}
	report.TimeToLevel1 = summarise(times)
	report.Matches = summarise(matchCounts)
	report.FinalSquadRating = summarise(ratings)
	report.FinalCash = summarise(cash)
	report.Histogram = histogram(times)
	for _, t := range facilityTypes {
		report.FinalTiers[t] = int(math.Floor(medianInt(tierSamples[t])))
	}
	return report, nil
}

var facilityTypes = []string{
	"stadium_grounds", "stands", "training_ground", "youth_academy",
	"scouting", "medical_centre", "staff_house",
}

// runAll runs every seed, in parallel across cores, deterministically.
func runAll(balance float64, strat Strategy, runs int, seed int64) []RunResult {
	out := make([]RunResult, runs)
	workers := runtime.GOMAXPROCS(0)
	if workers > runs {
		workers = runs
	}
	if workers < 1 {
		workers = 1
	}
	chunk := (runs + workers - 1) / workers
	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		lo := w * chunk
		hi := lo + chunk
		if hi > runs {
			hi = runs
		}
		if lo >= hi {
			continue
		}
		wg.Add(1)
		go func(lo, hi int) {
			defer wg.Done()
			for i := lo; i < hi; i++ {
				out[i] = runOne(balance, strat, newRand(seed, i))
			}
		}(lo, hi)
	}
	wg.Wait()
	return out
}

func summarise(xs []float64) Percentiles {
	if len(xs) == 0 {
		return Percentiles{}
	}
	cp := append([]float64(nil), xs...)
	sort.Float64s(cp)
	mean := 0.0
	for _, x := range cp {
		mean += x
	}
	mean /= float64(len(cp))
	return Percentiles{
		P10:    quantile(cp, 0.10),
		Median: quantile(cp, 0.50),
		P90:    quantile(cp, 0.90),
		Mean:   mean,
	}
}

func quantile(sorted []float64, q float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	pos := q * float64(len(sorted)-1)
	lo := int(math.Floor(pos))
	hi := int(math.Ceil(pos))
	if lo == hi {
		return sorted[lo]
	}
	return sorted[lo] + (sorted[hi]-sorted[lo])*(pos-float64(lo))
}

func medianInt(xs []int) float64 {
	if len(xs) == 0 {
		return 0
	}
	cp := append([]int(nil), xs...)
	sort.Ints(cp)
	n := len(cp)
	if n%2 == 1 {
		return float64(cp[n/2])
	}
	return float64(cp[n/2-1]+cp[n/2]) / 2
}

func histogram(times []float64) []HistogramBucket {
	buckets := []HistogramBucket{
		{Bucket: "0-30"}, {Bucket: "30-45"}, {Bucket: "45-60"}, {Bucket: "60-75"},
		{Bucket: "75-90"}, {Bucket: "90-120"}, {Bucket: "120-180"}, {Bucket: "180-240"},
		{Bucket: "240+"},
	}
	edges := []float64{30, 45, 60, 75, 90, 120, 180, 240, math.MaxFloat64}
	for _, t := range times {
		for i, e := range edges {
			if t < e {
				buckets[i].Count++
				break
			}
		}
	}
	return buckets
}
