package seasonpass

import "testing"

func TestTierForPoints(t *testing.T) {
	cases := map[int]int{0: 1, 249: 1, 250: 2, 799: 3, 800: 4, 22500: MaxTier(), 1_000_000: MaxTier()}
	for pts, want := range cases {
		if got := TierForPoints(pts); got != want {
			t.Errorf("TierForPoints(%d) = %d, want %d", pts, got, want)
		}
	}
}

func TestNextThreshold(t *testing.T) {
	if got := NextThreshold(0); got != 250 {
		t.Errorf("NextThreshold(0) = %d, want 250", got)
	}
	if got := NextThreshold(250); got != 500 {
		t.Errorf("NextThreshold(250) = %d, want 500", got)
	}
	if got := NextThreshold(22500); got != 0 {
		t.Errorf("maxed NextThreshold = %d, want 0", got)
	}
}

func TestCanClaim(t *testing.T) {
	if CanClaim(Gold, false, 3, 0) {
		t.Error("Gold rewards need the Season Pass")
	}
	if !CanClaim(Gold, true, 3, 0) {
		t.Error("Gold reward should be claimable with the pass")
	}
	if CanClaim(Gold, true, 3, 3) {
		t.Error("an already-claimed tier cannot be reclaimed")
	}
	if !CanClaim(Silver, false, 1, 0) {
		t.Error("Silver rewards are free")
	}
}

func TestBank(t *testing.T) {
	if got := BankAccrual(100000, 2000); got != 20000 {
		t.Errorf("20%% of 100000 = %d, want 20000", got)
	}
	if got := BankAccrual(100000, 0); got != 0 {
		t.Errorf("zero share = %d, want 0", got)
	}
	if got := BankClaimable(20000, 5000); got != 15000 {
		t.Errorf("claimable = %d, want 15000", got)
	}
	if got := BankClaimable(3000, 5000); got != 0 {
		t.Errorf("over-claimed = %d, want 0", got)
	}
}

// TestTierThresholdsMonotonic guards the tier table itself: strictly rising
// thresholds and a first threshold of 0 (every club starts at tier 1).
func TestTierThresholdsMonotonic(t *testing.T) {
	if len(TierThresholds) == 0 {
		t.Fatal("no tier thresholds")
	}
	if TierThresholds[0] != 0 {
		t.Errorf("first threshold = %d, want 0", TierThresholds[0])
	}
	for i := 1; i < len(TierThresholds); i++ {
		if TierThresholds[i] <= TierThresholds[i-1] {
			t.Errorf("threshold %d = %d not above %d", i, TierThresholds[i], TierThresholds[i-1])
		}
	}
	if MaxTier() != len(TierThresholds) {
		t.Errorf("MaxTier = %d, want %d", MaxTier(), len(TierThresholds))
	}
}

func TestTierForPointsMonotonic(t *testing.T) {
	prev := 0
	last := TierThresholds[len(TierThresholds)-1]
	for pts := 0; pts <= last+500; pts += 37 {
		tier := TierForPoints(pts)
		if tier < prev {
			t.Fatalf("tier regressed at %d points: %d after %d", pts, tier, prev)
		}
		prev = tier
	}
	if got := TierForPoints(last); got != MaxTier() {
		t.Errorf("the final threshold reaches tier %d, want MaxTier %d", got, MaxTier())
	}
}

// TestNextThresholdBoundaries checks NextThreshold is always the next threshold
// strictly above the current points, and 0 only once maxed.
func TestNextThresholdBoundaries(t *testing.T) {
	for _, pts := range []int{0, 249, 250, 899, 900, 22499, 22500} {
		nt := NextThreshold(pts)
		if nt == 0 {
			if TierForPoints(pts) < MaxTier() {
				t.Errorf("NextThreshold(%d) = 0 but tier %d < max", pts, TierForPoints(pts))
			}
			continue
		}
		if nt <= pts {
			t.Errorf("NextThreshold(%d) = %d, must exceed the current points", pts, nt)
		}
		if TierForPoints(nt) != TierForPoints(pts)+1 {
			t.Errorf("NextThreshold(%d) = %d must be exactly one tier up", pts, nt)
		}
	}
}

// TestCanClaimUnknownTrack guards the server-side gate: only the two declared
// tracks can be claimed.
func TestCanClaimUnknownTrack(t *testing.T) {
	if CanClaim(Track("platinum"), false, 5, 0) {
		t.Error("an unknown track must not be claimable")
	}
	if CanClaim(Track(""), true, 5, 0) {
		t.Error("an empty track must not be claimable")
	}
	if CanClaim(Silver, false, 4, 4) {
		t.Error("an already-claimed tier cannot be reclaimed")
	}
}

func TestBankGuards(t *testing.T) {
	if got := BankAccrual(0, 2000); got != 0 {
		t.Errorf("zero income = %d, want 0", got)
	}
	if got := BankAccrual(-100, 2000); got != 0 {
		t.Errorf("negative income = %d, want 0", got)
	}
	if got := BankAccrual(100000, -5); got != 0 {
		t.Errorf("negative share = %d, want 0", got)
	}
	if got := BankClaimable(5000, 5000); got != 0 {
		t.Errorf("fully claimed = %d, want 0", got)
	}
}
