package sim

import (
	"math"
	"math/rand"
)

// Player is one seeded free agent.
type Player struct {
	id       int
	Rating   int
	Age      int
	Position string
	Value    float64
	Wage     float64
}

// Manager is one seeded free manager.
type Manager struct {
	Overall     int
	Tactics     int
	Motivation  int
	Development int
	Discipline  int
	Fee         float64
	Wage        float64
}

// newRand returns a deterministic RNG for (seed, runIndex). Each run owns its
// stream, so runs are independent and reproducible in any order/parallelism.
func newRand(seed int64, runIndex int) *rand.Rand {
	x := uint64(seed)*0x9E3779B97F4A7C15 ^ uint64(runIndex+1)*0xD1B54A32D192ED03
	x ^= x >> 30
	x *= 0xBF58476D1CE4E5B9
	x ^= x >> 27
	x *= 0x94D049BB133111EB
	x ^= x >> 31
	return rand.New(rand.NewSource(int64(x)))
}

// pickBand samples a band by weight and returns a uniform integer in [lo, hi].
func pickBand(rng *rand.Rand, bands []band) float64 {
	total := 0.0
	for _, b := range bands {
		total += b.weight
	}
	r := rng.Float64() * total
	acc := 0.0
	for _, b := range bands {
		acc += b.weight
		if r <= acc {
			lo, hi := int(b.lo), int(b.hi)
			if hi <= lo {
				return b.lo
			}
			return float64(lo + rng.Intn(hi-lo+1))
		}
	}
	last := bands[len(bands)-1]
	return last.lo
}

func pickPosition(rng *rand.Rand) string {
	total := 0.0
	for _, p := range positionShares {
		total += p.weight
	}
	r := rng.Float64() * total
	acc := 0.0
	for _, p := range positionShares {
		acc += p.weight
		if r <= acc {
			return p.pos
		}
	}
	return "MID"
}

// genPlayers returns n seeded free agents from the spec histograms.
func genPlayers(rng *rand.Rand, n int) []Player {
	out := make([]Player, 0, n)
	for i := 0; i < n; i++ {
		rating := int(pickBand(rng, ratingHistogram))
		age := int(pickBand(rng, ageHistogram))
		pos := pickPosition(rng)
		value := FreeAgentValue(rating, age)
		out = append(out, Player{id: i, Rating: rating, Age: age, Position: pos, Value: value, Wage: PlayerWage(value)})
	}
	return out
}

// genManagers returns n seeded free managers from the spec histograms.
func genManagers(rng *rand.Rand, n int) []Manager {
	out := make([]Manager, 0, n)
	for i := 0; i < n; i++ {
		overall := int(pickBand(rng, managerHistogram))
		// Sample the four attributes around the overall, then re-derive the
		// overall with the spec's weights so facts.overall matches the formula.
		noise := func() int { return int(math.Round(rng.NormFloat64() * 4)) }
		t := clamp(overall+noise(), 40, 90)
		m := clamp(overall+noise(), 40, 90)
		d := clamp(overall+noise(), 40, 90)
		x := clamp(overall+noise(), 40, 90)
		derived := int(math.Round(0.40*float64(t) + 0.20*float64(m) + 0.25*float64(d) + 0.15*float64(x)))
		fee := ManagerFee(derived)
		out = append(out, Manager{Overall: derived, Tactics: t, Motivation: m, Development: d, Discipline: x, Fee: fee, Wage: ManagerWage(fee)})
	}
	return out
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

// median returns the median of a slice (0 for empty).
func median(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	cp := append([]float64(nil), xs...)
	for i := 0; i < len(cp); i++ {
		for j := i + 1; j < len(cp); j++ {
			if cp[j] < cp[i] {
				cp[i], cp[j] = cp[j], cp[i]
			}
		}
	}
	n := len(cp)
	if n%2 == 1 {
		return cp[n/2]
	}
	return (cp[n/2-1] + cp[n/2]) / 2
}
