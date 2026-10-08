package sim

import (
	"fmt"
	"math"
	"sort"
	"testing"
)

// TestBalanceMatrix is the Batch 4A acceptance harness (R13, OWNER-PROGRAM-SPEC
// §14). It runs >=1,000 seeded runs per strategy per starting balance, prints
// the before/after-style tables and histograms that go in BALANCE.md, and
// asserts the five acceptance criteria:
//
//  1. balanced_expert median inside §3.3 (45-90 min) at every balance;
//  2. every naive strategy is >=2x slower OR triggers recovery;
//  3. balanced_expert@V1M median < random@V5M median (skill beats luck, L7);
//  4. 0 soft-locks at every balance;
//  5. star total correlates with time-to-Level-1 (Spearman(star, speed) > 0).
//
// It is skipped under -short.
func TestBalanceMatrix(t *testing.T) {
	if testing.Short() {
		t.Skip("balance matrix skipped in -short")
	}
	const runs = 1000
	const seed = 4242
	balances := []float64{1_000_000, 3_000_000, 5_000_000}

	// Run every cell, keeping the per-run data for the correlation and
	// histograms. runAll is the same deterministic engine the endpoint uses.
	type cell struct {
		strategy Strategy
		balance  float64
		results  []RunResult
	}
	var cells []cell
	byKey := map[string]cell{}
	for _, b := range balances {
		for _, s := range AllStrategies() {
			rs := runAll(b, s, runs, seed)
			cells = append(cells, cell{s, b, rs})
			byKey[fmt.Sprintf("%s@%.0f", s, b)] = cell{s, b, rs}
		}
	}

	// report aggregates the way Run does, from the per-run data.
	report := func(rs []RunResult) SimulationReport {
		var times, matches, ratings, cash []float64
		rep := SimulationReport{StarDistribution: map[string]int{}, FinalTiers: map[string]int{}}
		tierSamples := map[string][]int{}
		for _, r := range rs {
			if r.Bankrupt {
				rep.Bankrupt++
			}
			if r.Recovery > 0 {
				rep.Recovery++
			}
			if r.SoftLocked {
				rep.SoftLocked++
				continue
			}
			times = append(times, r.Minutes)
			matches = append(matches, float64(r.Matches))
			ratings = append(ratings, r.FinalRating)
			cash = append(cash, r.FinalCash)
			rep.StarDistribution[fmt.Sprintf("%d", r.StarTotal)]++
			for _, tp := range facilityTypes {
				tierSamples[tp] = append(tierSamples[tp], r.FinalTiers[tp])
			}
		}
		rep.TimeToLevel1 = summarise(times)
		rep.Matches = summarise(matches)
		rep.FinalSquadRating = summarise(ratings)
		rep.FinalCash = summarise(cash)
		rep.Histogram = histogram(times)
		for _, tp := range facilityTypes {
			rep.FinalTiers[tp] = int(math.Floor(medianInt(tierSamples[tp])))
		}
		return rep
	}

	t.Logf("=== BALANCE MATRIX (runs=%d seed=%d) ===", runs, seed)
	t.Logf("%-8s %-18s %6s %6s %6s %7s %8s %6s %6s %8s %7s", "balance", "strategy", "p10", "med", "p90", "matches", "recovery", "bankr", "soft", "progStars", "progXp")
	medians := map[string]float64{}
	for _, b := range balances {
		for _, s := range AllStrategies() {
			rs := byKey[fmt.Sprintf("%s@%.0f", s, b)].results
			rep := report(rs)
			medians[fmt.Sprintf("%s@%.0f", s, b)] = rep.TimeToLevel1.Median
			t.Logf("V%-7.0fM %-18s %6.0f %6.0f %6.0f %7.1f %8d %6d %6d %8.0f %7.0f",
				b/1e6, s, rep.TimeToLevel1.P10, rep.TimeToLevel1.Median, rep.TimeToLevel1.P90,
				rep.Matches.Median, rep.Recovery, rep.Bankrupt, rep.SoftLocked,
				medianOf(rs, func(r RunResult) float64 { return float64(r.ProgramStars) }),
				medianOf(rs, func(r RunResult) float64 { return float64(r.ProgramXp) }))
		}
	}

	t.Logf("--- histograms (time-to-Level-1 minutes) ---")
	for _, c := range cells {
		rep := report(c.results)
		line := fmt.Sprintf("V%.0fM %-18s", c.balance/1e6, c.strategy)
		for _, h := range rep.Histogram {
			line += fmt.Sprintf(" %s:%d", h.Bucket, h.Count)
		}
		t.Logf("%s", line)
	}

	t.Logf("--- star distribution (sum of 4 step stars, out of 12) ---")
	for _, c := range cells {
		rep := report(c.results)
		var keys []string
		for k := range rep.StarDistribution {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		line := fmt.Sprintf("V%.0fM %-18s", c.balance/1e6, c.strategy)
		for _, k := range keys {
			line += fmt.Sprintf(" %s★:%d", k, rep.StarDistribution[k])
		}
		t.Logf("%s", line)
	}

	// --- 5. star rating correlates with time-to-Level-1 ---
	// Spearman(star, speed) with speed = -minutes; >0 means more stars finish
	// sooner. We report both the total (incl. the level1 step, scored at the
	// end) and the three program-step stars (earned before the friendly grind,
	// the stars that actually predict how many friendlies are needed).
	t.Logf("--- Spearman correlation (stars vs time) ---")
	collect := func(cells []cell, pick func(RunResult) float64) (xs, times []float64) {
		for _, c := range cells {
			for _, r := range c.results {
				if r.SoftLocked {
					continue
				}
				xs = append(xs, pick(r))
				times = append(times, r.Minutes)
			}
		}
		return
	}
	for _, s := range AllStrategies() {
		var cs []cell
		for _, b := range balances {
			cs = append(cs, cell{strategy: s, balance: b, results: byKey[fmt.Sprintf("%s@%.0f", s, b)].results})
		}
		xsP, tsP := collect(cs, func(r RunResult) float64 { return float64(r.ProgramStars) })
		xsT, tsT := collect(cs, func(r RunResult) float64 { return float64(r.StarTotal) })
		t.Logf("%-18s progStars rho=%+.3f (speed)   starTotal rho=%+.3f (speed)   n=%d",
			s, -spearman(xsP, tsP), -spearman(xsT, tsT), len(xsP))
	}
	// Pooled across every strategy and balance: the population-level claim
	// that decision quality predicts speed.
	allP, allT := collect(cells, func(r RunResult) float64 { return float64(r.ProgramStars) })
	allS, _ := collect(cells, func(r RunResult) float64 { return float64(r.StarTotal) })
	allXp, _ := collect(cells, func(r RunResult) float64 { return float64(r.ProgramXp) })
	rhoProg := spearman(allP, allT)
	rhoTotal := spearman(allS, allT)
	rhoXp := spearman(allXp, allT)
	t.Logf("POOLED (all strategies/balances): progStars rho(minutes)=%+.3f (speed %+.3f) | starTotal rho(minutes)=%+.3f (speed %+.3f) | progXp rho(minutes)=%+.3f n=%d",
		rhoProg, -rhoProg, rhoTotal, -rhoTotal, rhoXp, len(allP))

	// --- assertions ---
	for _, b := range balances {
		expert := report(byKey[fmt.Sprintf("balanced_expert@%.0f", b)].results)
		if expert.TimeToLevel1.Median < 45 || expert.TimeToLevel1.Median > 90 {
			t.Errorf("criterion 1: balanced_expert@V%.0fM median %.0f outside 45-90", b/1e6, expert.TimeToLevel1.Median)
		}
		expertMedian := expert.TimeToLevel1.Median
		for _, s := range AllStrategies() {
			if s == BalancedExpert {
				continue
			}
			naive := report(byKey[fmt.Sprintf("%s@%.0f", s, b)].results)
			twoX := naive.TimeToLevel1.Median >= 2*expertMedian
			recovered := naive.Recovery > 0
			if !twoX && !recovered {
				t.Errorf("criterion 2: %s@V%.0fM median %.0f (<2x expert %.0f) and no recovery", s, b/1e6, naive.TimeToLevel1.Median, expertMedian)
			}
		}
		if expert.SoftLocked != 0 {
			t.Errorf("criterion 4: balanced_expert@V%.0fM soft-locked %d", b/1e6, expert.SoftLocked)
		}
	}
	// criterion 2 soft-locks: none anywhere.
	for _, c := range cells {
		if rep := report(c.results); rep.SoftLocked != 0 {
			t.Errorf("criterion 4: %s@V%.0fM soft-locked %d", c.strategy, c.balance/1e6, rep.SoftLocked)
		}
	}
	// criterion 3: L7 strict.
	expertV1 := report(byKey["balanced_expert@1000000"].results)
	randomV5 := report(byKey["random@5000000"].results)
	if expertV1.TimeToLevel1.Median >= randomV5.TimeToLevel1.Median {
		t.Errorf("criterion 3 (L7): expert@V1M median %.0f not faster than random@V5M median %.0f",
			expertV1.TimeToLevel1.Median, randomV5.TimeToLevel1.Median)
	}
	// criterion 5: higher program-step stars must predict less time, pooled
	// across every strategy and balance (Spearman(stars, speed) > 0).
	if !(rhoProg < -0.3) {
		t.Errorf("criterion 5: pooled Spearman(progStars, minutes)=%+.3f, want < -0.3 (more stars → less time)", rhoProg)
	}
	_ = cells
}

// medianOf returns the median of pick over results.
func medianOf(rs []RunResult, pick func(RunResult) float64) float64 {
	xs := make([]float64, 0, len(rs))
	for _, r := range rs {
		xs = append(xs, pick(r))
	}
	return summarise(xs).Median
}

// spearman returns the Spearman rank correlation of x and y with average ranks
// for ties. n < 3 returns 0.
func spearman(x, y []float64) float64 {
	n := len(x)
	if n != len(y) || n < 3 {
		return 0
	}
	rx, ry := rankAvg(x), rankAvg(y)
	mx, my := mean(rx), mean(ry)
	var num, dx, dy float64
	for i := 0; i < n; i++ {
		a, b := rx[i]-mx, ry[i]-my
		num += a * b
		dx += a * a
		dy += b * b
	}
	if dx == 0 || dy == 0 {
		return 0
	}
	return num / math.Sqrt(dx*dy)
}

func rankAvg(v []float64) []float64 {
	n := len(v)
	idx := make([]int, n)
	for i := range idx {
		idx[i] = i
	}
	sort.Slice(idx, func(i, j int) bool { return v[idx[i]] < v[idx[j]] })
	out := make([]float64, n)
	for i := 0; i < n; {
		j := i
		for j+1 < n && v[idx[j+1]] == v[idx[i]] {
			j++
		}
		// average rank of positions i..j (1-based)
		avg := float64(i+j+2) / 2.0
		for k := i; k <= j; k++ {
			out[idx[k]] = avg
		}
		i = j + 1
	}
	return out
}

func mean(v []float64) float64 {
	s := 0.0
	for _, x := range v {
		s += x
	}
	return s / float64(len(v))
}
