package sim

import (
	"testing"
)

// TestSkillBeatsLuckAcrossSeeds is the L7 robustness check: balanced-expert at
// the worst balance (V1M) must beat the luckiest naive owner (random at V5M) on
// the median, across many seeds. 500 runs per cell.
func TestSkillBeatsLuckAcrossSeeds(t *testing.T) {
	if testing.Short() {
		t.Skip("skill-beats-luck seeds skipped in -short")
	}
	seeds := []int64{1, 7, 42, 99, 512, 2024, 4242, 31337, 99999, 123456}
	for _, seed := range seeds {
		expert, err := Run(Request{Balance: 1_000_000, Strategy: string(BalancedExpert), Runs: 500, Seed: seed})
		if err != nil {
			t.Fatal(err)
		}
		random, err := Run(Request{Balance: 5_000_000, Strategy: string(Random), Runs: 500, Seed: seed})
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("seed %-7d expert@V1M median=%.0f (p90=%.0f) vs random@V5M median=%.0f (p10=%.0f)",
			seed, expert.TimeToLevel1.Median, expert.TimeToLevel1.P90, random.TimeToLevel1.Median, random.TimeToLevel1.P10)
		if expert.TimeToLevel1.Median >= random.TimeToLevel1.Median {
			t.Errorf("seed %d: L7 fails: expert@V1M %.0f not faster than random@V5M %.0f",
				seed, expert.TimeToLevel1.Median, random.TimeToLevel1.Median)
		}
	}
}
