// Package matchrating is the 0-3 star raid rating (docs/coc-mapping/02 §D): a
// graded outcome from goals plus dominance, so every match reads like a CoC raid
// (near-miss texture) while staying a pure function of the simulation.
package matchrating

// Dominance is a club's command of a match in [0,1]: half possession share, half
// expected-goals share. When both totals are zero it is a neutral 0.5.
func Dominance(possFor, possAgainst, xgFor, xgAgainst float64) float64 {
	poss := share(possFor, possAgainst)
	xg := share(xgFor, xgAgainst)
	return clamp01(0.5*poss + 0.5*xg)
}

func share(a, b float64) float64 {
	if a <= 0 && b <= 0 {
		return 0.5
	}
	if a < 0 {
		a = 0
	}
	if b < 0 {
		b = 0
	}
	t := a + b
	if t <= 0 {
		return 0.5
	}
	return a / t
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

// DominanceThreshold is the control level a narrow win needs for a second star,
// and a two-goal win needs (with a clean sheet) for a third.
const DominanceThreshold = 0.6

// Stars rates one club's match 0-3:
//   - 0: defeat
//   - 1: draw, or a narrow win (by 1) without command
//   - 2: a clear win (by 2), or a narrow win with command
//   - 3: a dominant win (by 3, or by 2 with command and a clean sheet)
func Stars(goalsFor, goalsAgainst int, dominance float64, cleanSheet bool) int {
	switch {
	case goalsFor < goalsAgainst:
		return 0
	case goalsFor == goalsAgainst:
		return 1
	}
	gd := goalsFor - goalsAgainst
	switch {
	case gd >= 3:
		return 3
	case gd >= 2:
		if dominance >= DominanceThreshold && cleanSheet {
			return 3
		}
		return 2
	default: // gd == 1
		if dominance >= DominanceThreshold {
			return 2
		}
		return 1
	}
}
