// Package legacy is the Club Legacy chain (docs/coc-mapping/04 §2): a
// long-horizon ladder of club objectives whose completion grants the 6th
// Groundskeeper (campus.MaxGroundskeepers == 6, the Builder Base "B.O.B"
// analog). A club earns stars per objective; the chain is complete once every
// step is met. Pure so the rules are table-testable; the HTTP/storage layer
// wires these functions to Postgres.
package legacy

// Step is one objective in the Club Legacy chain. Stars is how many of that
// objective's stars must be earned before the step counts as met (1-3).
type Step struct {
	ID    string
	Stars int
}

// Chain is the Club Legacy objective chain, in completion order. The brief's
// "30+ objectives" is content - tunable; this seeded set is a representative
// long-horizon slice, and each step is a real club milestone rather than a
// currency grind.
var Chain = []Step{
	{ID: "first-grounds", Stars: 1},
	{ID: "first-raid-win", Stars: 1},
	{ID: "clean-sheet-streak", Stars: 2},
	{ID: "promote-a-teen", Stars: 2},
	{ID: "cup-run", Stars: 2},
	{ID: "fortress-home", Stars: 3},
	{ID: "hundred-fixtures", Stars: 3},
	{ID: "club-legend", Stars: 3},
}

// MaxStars is the total star credits the chain can award.
func MaxStars() int {
	total := 0
	for _, s := range Chain {
		total += s.Stars
	}
	return total
}

// Met reports whether a single step's star requirement is satisfied.
func Met(step Step, stars map[string]int) bool {
	return stars[step.ID] >= step.Stars
}

// Complete reports whether every chain step has been met.
func Complete(stars map[string]int) bool {
	for _, s := range Chain {
		if !Met(s, stars) {
			return false
		}
	}
	return true
}

// Granted is the 6th Groundskeeper unlocked by the chain: 1 once the chain is
// complete, otherwise 0. (Groundskeepers 2-5 come from milestones/Sponsor
// Credits, 04 §2.)
func Granted(stars map[string]int) int {
	if Complete(stars) {
		return 1
	}
	return 0
}

// Remaining lists the chain steps not yet met, in chain order.
func Remaining(stars map[string]int) []Step {
	out := make([]Step, 0, len(Chain))
	for _, s := range Chain {
		if !Met(s, stars) {
			out = append(out, s)
		}
	}
	return out
}

// TotalStars is the star credits earned across the chain, capped at MaxStars:
// stars banked past a step's requirement are not re-counted, so this can never
// exceed the chain maximum.
func TotalStars(stars map[string]int) int {
	total := 0
	for _, s := range Chain {
		n := stars[s.ID]
		if n > s.Stars {
			n = s.Stars
		}
		if n > 0 {
			total += n
		}
	}
	return total
}
