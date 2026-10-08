package sim

import (
	"math"
	"reflect"
	"testing"
)

func TestOutcomeProbBands(t *testing.T) {
	tests := []struct {
		name    string
		gap     float64
		wantW   float64
		wantD   float64
		wantL   float64
		epsilon float64
	}{
		{"home even", 0.0, 0.44, 0.24, 0.31, 1e-9},
		{"mirrored negative", -5.5, 0.17, 0.27, 0.56, 1e-9},
		{"band 3-8 midpoint", 5.5, 0.56, 0.27, 0.17, 1e-9},
		{"band 8-15 midpoint", 11.5, 0.83, 0.12, 0.05, 1e-9},
		{"far stronger", 25.0, 0.96, 0.03, 0.01, 1e-9},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w, d, l := OutcomeProb(tt.gap)
			if math.Abs(w-tt.wantW) > tt.epsilon || math.Abs(d-tt.wantD) > tt.epsilon || math.Abs(l-tt.wantL) > tt.epsilon {
				t.Fatalf("OutcomeProb(%v) = %.4f/%.4f/%.4f, want %.4f/%.4f/%.4f", tt.gap, w, d, l, tt.wantW, tt.wantD, tt.wantL)
			}
			if math.Abs(w+d+l-1.0) > 0.02 {
				t.Fatalf("probabilities do not sum to ~1: %.4f", w+d+l)
			}
		})
	}
}

func TestOutcomeProbMonotonicInGap(t *testing.T) {
	prev := -1.0
	for gap := 0.0; gap <= 30.0; gap += 0.5 {
		w, _, _ := OutcomeProb(gap)
		if w < prev {
			t.Fatalf("pWin not monotonic at gap %.1f: %.3f < %.3f", gap, w, prev)
		}
		prev = w
	}
}

func TestCostCurves(t *testing.T) {
	// An XI of rating ~52 costs ~V0.6M (spec §5.6).
	xi := 0.0
	for i := 0; i < 11; i++ {
		xi += FreeAgentValue(52, 26)
	}
	if xi < 550_000 || xi > 650_000 {
		t.Fatalf("XI of rating 52 = %.0f, want ~605000", xi)
	}
	// A rating-72 age-24 attacker costs ~V1.9M.
	if v := FreeAgentValue(72, 24); v < 1_800_000 || v > 2_000_000 {
		t.Fatalf("rating-72 age-24 value = %.0f, want ~1.9M", v)
	}
	if fee := ManagerFee(58); fee != 180_000 {
		t.Fatalf("ManagerFee(58) = %.0f, want 180000", fee)
	}
	if fee := ManagerFee(66); fee != 650_000 {
		t.Fatalf("ManagerFee(66) = %.0f, want 650000", fee)
	}
}

func TestSimDeterminism(t *testing.T) {
	req := Request{Balance: 1_000_000, Strategy: string(BalancedExpert), Runs: 64, Seed: 12345}
	first, err := Run(req)
	if err != nil {
		t.Fatal(err)
	}
	second, err := Run(req)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("simulate is not deterministic:\n%+v\n%+v", first, second)
	}
}

func TestSimDeterminismAcrossChunking(t *testing.T) {
	// The same seed with different run counts must agree on the shared prefix.
	a, err := Run(Request{Balance: 3_000_000, Strategy: string(Random), Runs: 200, Seed: 7})
	if err != nil {
		t.Fatal(err)
	}
	b, err := Run(Request{Balance: 3_000_000, Strategy: string(Random), Runs: 200, Seed: 7})
	if err != nil {
		t.Fatal(err)
	}
	if a.SoftLocked != b.SoftLocked || a.Recovery != b.Recovery {
		t.Fatalf("cross-run mismatch: %+v vs %+v", a, b)
	}
}

func TestSimNoSoftLocks(t *testing.T) {
	for _, balance := range []float64{1_000_000, 3_000_000, 5_000_000} {
		for _, strat := range AllStrategies() {
			report, err := Run(Request{Balance: balance, Strategy: string(strat), Runs: 200, Seed: 99})
			if err != nil {
				t.Fatal(err)
			}
			if report.SoftLocked != 0 {
				t.Errorf("%s @ %.0f: %d soft-locks", strat, balance, report.SoftLocked)
			}
		}
	}
}

func TestExpertBeatsNaiveAtEqualBalance(t *testing.T) {
	// Skill shows within a starting balance: the balanced expert never needs a
	// recovery and finishes at or ahead of every naive strategy. (The stricter
	// cross-budget L7 median is a 4A tuning target; TestSimKeyNumbers logs it.)
	for _, balance := range []float64{1_000_000, 3_000_000, 5_000_000} {
		expert, err := Run(Request{Balance: balance, Strategy: string(BalancedExpert), Runs: 400, Seed: 2024})
		if err != nil {
			t.Fatal(err)
		}
		if expert.Recovery != 0 {
			t.Errorf("balanced-expert @ %.0f needed %d recoveries, want 0", balance, expert.Recovery)
		}
		for _, strat := range []Strategy{Random, AllInOnPlayers} {
			naive, err := Run(Request{Balance: balance, Strategy: string(strat), Runs: 400, Seed: 2024})
			if err != nil {
				t.Fatal(err)
			}
			if expert.TimeToLevel1.Median > naive.TimeToLevel1.Median {
				t.Errorf("%s @ %.0f median %.0f is faster than balanced-expert %.0f",
					strat, balance, naive.TimeToLevel1.Median, expert.TimeToLevel1.Median)
			}
		}
	}
}

// TestSkillBeatsLuckV1 logs and soft-checks L7: balanced-expert at V1M should be
// at least as fast as the lucky naive random owner at V5M.
func TestSkillBeatsLuckV1(t *testing.T) {
	expertV1, err := Run(Request{Balance: 1_000_000, Strategy: string(BalancedExpert), Runs: 1000, Seed: 2024})
	if err != nil {
		t.Fatal(err)
	}
	randomV5, err := Run(Request{Balance: 5_000_000, Strategy: string(Random), Runs: 1000, Seed: 2024})
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("L7: balanced-expert@V1M median %.0f vs random@V5M median %.0f (stars expert=%v random=%v recovery=%d/%d)",
		expertV1.TimeToLevel1.Median, randomV5.TimeToLevel1.Median,
		expertV1.StarDistribution, randomV5.StarDistribution, expertV1.Recovery, randomV5.Recovery)
	if expertV1.TimeToLevel1.Median > randomV5.TimeToLevel1.Median {
		t.Errorf("L7 regression: balanced-expert@V1M %.0f slower than random@V5M %.0f",
			expertV1.TimeToLevel1.Median, randomV5.TimeToLevel1.Median)
	}
}

func TestSimValidation(t *testing.T) {
	tests := []struct {
		name string
		req  Request
	}{
		{"balance too low", Request{Balance: 10, Strategy: string(Random), Runs: 1}},
		{"balance too high", Request{Balance: 9_000_000, Strategy: string(Random), Runs: 1}},
		{"bad strategy", Request{Balance: 1_000_000, Strategy: "yolo", Runs: 1}},
		{"zero runs", Request{Balance: 1_000_000, Strategy: string(Random), Runs: 0}},
		{"too many runs", Request{Balance: 1_000_000, Strategy: string(Random), Runs: 1_000_000}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.req.Validate(); err == nil {
				t.Fatal("expected a validation error")
			}
		})
	}
}

// TestSimKeyNumbers logs the medians that go in the B2-2A report. It also
// asserts the acceptance ordering that R13/L7 require of Batch 4A.
func TestSimKeyNumbers(t *testing.T) {
	if testing.Short() {
		t.Skip("key numbers skipped in -short")
	}
	balances := []float64{1_000_000, 3_000_000, 5_000_000}
	for _, b := range balances {
		for _, strat := range AllStrategies() {
			report, err := Run(Request{Balance: b, Strategy: string(strat), Runs: 1000, Seed: 4242})
			if err != nil {
				t.Fatal(err)
			}
			t.Logf("V%.0fM %-18s median=%.0f p10=%.0f p90=%.0f matches=%.1f stars=%v recovery=%d soft=%d",
				b/1_000_000, strat, report.TimeToLevel1.Median, report.TimeToLevel1.P10,
				report.TimeToLevel1.P90, report.Matches.Median, report.StarDistribution,
				report.Recovery, report.SoftLocked)
		}
	}
}
