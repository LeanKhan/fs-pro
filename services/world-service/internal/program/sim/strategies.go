package sim

import (
	"math/rand"
	"sort"

	"fs-pro-world-service/internal/program"
)

// Strategy is one scripted owner style (spec §14).
type Strategy string

const (
	Random           Strategy = "random"
	FacilitiesFirst  Strategy = "facilities_first"
	SplurgeOnManager Strategy = "splurge_on_manager"
	AllInOnPlayers   Strategy = "all_in_on_players"
	BalancedExpert   Strategy = "balanced_expert"
)

// AllStrategies is the frozen list, in report order.
func AllStrategies() []Strategy {
	return []Strategy{Random, FacilitiesFirst, SplurgeOnManager, AllInOnPlayers, BalancedExpert}
}

// ParseStrategy validates a strategy name.
func ParseStrategy(s string) (Strategy, bool) {
	for _, x := range AllStrategies() {
		if string(x) == s {
			return x, true
		}
	}
	return "", false
}

// ---------------------------------------------------------------------------
// Pool helpers. clubState.pool is the remaining unsigned market; every signing
// removes from it, so no player can be signed twice.
// ---------------------------------------------------------------------------

// take removes the player with the given id from the market and signs it.
func (c *clubState) take(id int) (Player, bool) {
	for i, p := range c.pool {
		if p.id == id {
			if p.Value > c.budget {
				return Player{}, false
			}
			c.pool = append(c.pool[:i], c.pool[i+1:]...)
			c.budget -= p.Value
			c.squad = append(c.squad, p)
			return p, true
		}
	}
	return Player{}, false
}

// sortedByRating returns market players, best rating per cost first.
func (c *clubState) sortedByRating() []Player {
	cp := append([]Player(nil), c.pool...)
	sort.SliceStable(cp, func(i, j int) bool {
		if cp[i].Rating != cp[j].Rating {
			return cp[i].Rating > cp[j].Rating
		}
		return cp[i].Value < cp[j].Value
	})
	return cp
}

// sortedByCost returns market players, cheapest first.
func (c *clubState) sortedByCost() []Player {
	cp := append([]Player(nil), c.pool...)
	sort.SliceStable(cp, func(i, j int) bool {
		if cp[i].Value != cp[j].Value {
			return cp[i].Value < cp[j].Value
		}
		return cp[i].Rating > cp[j].Rating
	})
	return cp
}

func posCount(squad []Player, pos string) int {
	n := 0
	for _, p := range squad {
		if p.Position == pos {
			n++
		}
	}
	return n
}

// signToShape fills the target shape (position -> count) from the market, best
// rating per cost first, within avail cash.
func (c *clubState) signToShape(avail float64, targets map[string]int) {
	budgetFloor := c.budget - avail
	for _, pos := range []string{"GK", "DEF", "MID", "ATT"} {
		for posCount(c.squad, pos) < targets[pos] {
			var pick *Player
			for i := range c.pool {
				p := &c.pool[i]
				if p.Position != pos {
					continue
				}
				if p.Value > c.budget-budgetFloor {
					continue
				}
				if pick == nil || p.Value < pick.Value || (p.Value == pick.Value && p.Rating > pick.Rating) {
					pick = p
				}
			}
			if pick == nil {
				break
			}
			if _, ok := c.take(pick.id); !ok {
				break
			}
		}
	}
}

// signCheapest signs up to n players, forcing a keeper first.
func (c *clubState) signCheapest(n int) {
	for _, p := range c.sortedByCost() {
		if len(c.squad) >= n {
			return
		}
		if p.Position == "GK" && posCount(c.squad, "GK") >= 1 {
			continue
		}
		c.take(p.id)
	}
	// If no keeper was available, fill any positions to n.
	for _, p := range c.sortedByCost() {
		if len(c.squad) >= n {
			return
		}
		c.take(p.id)
	}
}

// signBestSpend spends down toward floor on the highest-rated players, with at
// least one keeper.
func (c *clubState) signBestSpend(floor float64) {
	gks := make([]Player, 0)
	for _, p := range c.pool {
		if p.Position == "GK" {
			gks = append(gks, p)
		}
	}
	sort.SliceStable(gks, func(i, j int) bool { return gks[i].Rating > gks[j].Rating })
	if len(gks) > 0 && gks[0].Value <= c.budget-floor {
		c.take(gks[0].id)
	}
	for _, p := range c.sortedByRating() {
		if p.Position == "GK" {
			continue
		}
		if p.Value > c.budget-floor {
			continue
		}
		c.take(p.id)
	}
}

// randomSign signs a random affordable market subset up to n, with a keeper.
func (c *clubState) randomSign(n int, rng *rand.Rand) {
	// Force a keeper.
	gks := make([]Player, 0)
	for _, p := range c.pool {
		if p.Position == "GK" {
			gks = append(gks, p)
		}
	}
	if len(gks) > 0 {
		c.take(gks[rng.Intn(len(gks))].id)
	}
	snapshot := append([]Player(nil), c.pool...)
	order := rng.Perm(len(snapshot))
	for _, i := range order {
		if len(c.squad) >= n {
			return
		}
		p := snapshot[i]
		if p.Value <= c.budget {
			c.take(p.id)
		}
	}
}

// ---------------------------------------------------------------------------
// Manager selection
// ---------------------------------------------------------------------------

func affordableManagers(managers []Manager, budget float64) []Manager {
	var out []Manager
	for _, m := range managers {
		if m.Fee <= budget {
			out = append(out, m)
		}
	}
	return out
}

func (c *clubState) pickManager(strat Strategy, managers []Manager, rng *rand.Rand) {
	affordable := affordableManagers(managers, c.budget)
	if len(affordable) == 0 {
		return
	}
	var chosen Manager
	switch strat {
	case SplurgeOnManager:
		chosen = affordable[0]
		for _, m := range affordable {
			if m.Overall > chosen.Overall {
				chosen = m
			}
		}
	case BalancedExpert:
		cap := 0.40 * c.startingBalance
		best := Manager{}
		found := false
		for _, m := range affordable {
			if m.Fee > cap || c.budget-m.Fee < 420_000 {
				continue
			}
			if !found || m.Overall > best.Overall {
				best, found = m, true
			}
		}
		if !found {
			best = affordable[0]
			for _, m := range affordable {
				if m.Fee < best.Fee {
					best = m
				}
			}
		}
		chosen = best
	case FacilitiesFirst, AllInOnPlayers:
		chosen = affordable[0]
		for _, m := range affordable {
			if m.Fee < chosen.Fee {
				chosen = m
			}
		}
	default: // Random
		chosen = affordable[rng.Intn(len(affordable))]
	}
	c.budget -= chosen.Fee
	c.manager = &chosen
	c.managerFeePaid = chosen.Fee
}

// ---------------------------------------------------------------------------
// Facility selection
// ---------------------------------------------------------------------------

func (c *clubState) facilityChoice(strat Strategy, rng *rand.Rand) string {
	switch strat {
	case FacilitiesFirst:
		best := ""
		bestCost := 0.0
		for t, cost := range FacilityBaseCost {
			if cost <= c.budget-220_000 && cost > bestCost {
				best, bestCost = t, cost
			}
		}
		return best
	case SplurgeOnManager:
		if c.budget >= FacilityBaseCost["training_ground"] {
			return "training_ground"
		}
	case Random:
		var affordable []string
		for t, cost := range FacilityBaseCost {
			if cost <= c.budget {
				affordable = append(affordable, t)
			}
		}
		if len(affordable) > 0 {
			return affordable[rng.Intn(len(affordable))]
		}
	case BalancedExpert:
		if c.budget >= FacilityBaseCost["training_ground"] {
			return "training_ground"
		}
	case AllInOnPlayers:
		if c.budget >= FacilityBaseCost["training_ground"] {
			return "training_ground"
		}
	}
	return ""
}

// opponentRating models closest-power matchmaking (play.service.ts:202-217:
// opponents are the 5 clubs nearest the club's own Rating, picked at random).
// The sampled opponent is therefore close to the club itself, with a small
// spread; the sim-lab quality table then maps the residual gap to outcomes.
func opponentRating(own float64, rng *rand.Rand) float64 {
	v := own + rng.NormFloat64()*2.0
	if v < 40 {
		v = 40
	}
	if v > 90 {
		v = 90
	}
	return v
}

// medianXI is the median Rating of the club's best 11 (spec §3.2 step 2).
func medianXI(squad []Player) float64 {
	if len(squad) == 0 {
		return 0
	}
	ratings := make([]float64, 0, len(squad))
	for _, p := range squad {
		ratings = append(ratings, float64(p.Rating))
	}
	sort.Sort(sort.Reverse(sort.Float64Slice(ratings)))
	if len(ratings) > 11 {
		ratings = ratings[:11]
	}
	return median(ratings)
}

// squadCounts returns GK/DEF/MID/ATT.
func squadCounts(squad []Player) (int, int, int, int) {
	return posCount(squad, "GK"), posCount(squad, "DEF"), posCount(squad, "MID"), posCount(squad, "ATT")
}

// recordStar evaluates a step at the moment it completes and stores its stars.
// Evaluating in place is what gives "V400k cash left after the hire" and
// "≥V100k after the squad" their intended meaning (the live game scores each
// step as it completes, not at the end of the program).
func (c *clubState) recordStar(step program.Step) {
	if c.stars == nil {
		c.stars = map[program.Step]int{}
	}
	ev, _ := program.Evaluate(program.ProgramEvaluateRequest{Step: step, Facts: c.facts(step)})
	c.stars[step] = int(ev.Stars)
}

// programXpTotal sums the rewards of the three paying steps, capped at 54.
func (c *clubState) programXpTotal() int {
	xp := 0
	for _, s := range []program.Step{program.StepManager, program.StepPlayers, program.StepFacilities} {
		xp = program.AddProgramXp(xp, program.RewardXP(program.Stars(c.stars[s])))
	}
	return xp
}

// starTotal is the sum of stars across all four steps.
func (c *clubState) starTotal() int {
	total := 0
	for _, s := range []program.Step{program.StepManager, program.StepPlayers, program.StepFacilities} {
		total += c.stars[s]
	}
	levelFacts := c.facts(program.StepLevel1)
	levelFacts.ProgramXp = c.programXpTotal()
	ev, _ := program.Evaluate(program.ProgramEvaluateRequest{Step: program.StepLevel1, Facts: levelFacts})
	total += int(ev.Stars)
	return total
}

// facts builds the pure snapshot for one step from the run state.
func (c *clubState) facts(step program.Step) program.StepFacts {
	gk, def, mid, att := squadCounts(c.squad)
	var mf *program.ManagerFacts
	if c.manager != nil {
		mf = &program.ManagerFacts{
			Overall:       c.manager.Overall,
			Tactics:       c.manager.Tactics,
			Motivation:    c.manager.Motivation,
			Development:   c.manager.Development,
			Discipline:    c.manager.Discipline,
			SigningFee:    c.managerFeePaid,
			Wage:          c.manager.Wage,
			ContractYears: 3,
		}
	}
	assets := make([]program.AssetFacts, 0, len(c.assets))
	for t, tier := range c.assets {
		assets = append(assets, program.AssetFacts{Type: t, Tier: tier, UpgradingTo: nil, HasEffect: true})
	}
	return program.StepFacts{
		Step:            step,
		StartingBalance: c.startingBalance,
		Budget:          c.budget,
		Manager:         mf,
		Squad:           program.SquadFacts{Total: len(c.squad), GK: gk, Def: def, Mid: mid, Att: att, MedianRating: medianXI(c.squad)},
		Assets:          assets,
		ProgramXp:       0,
		ClubXp:          c.clubXp,
		Friendlies:      program.FriendlyFacts{Wins: c.wins, Draws: c.draws, Losses: c.losses},
		Scout:           program.ScoutFacts{},
		Events:          program.EventFacts{},
	}
}
