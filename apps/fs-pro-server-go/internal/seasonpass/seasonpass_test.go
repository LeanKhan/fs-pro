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
