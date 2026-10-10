package scout

import "testing"

func TestMaskNarrowsWithScouting(t *testing.T) {
	l0 := Mask(1000, 0)
	if l0.Low != 985 || l0.High != 1015 {
		t.Errorf("level 0 mask = %+v, want {985,1015}", l0)
	}
	l1 := Mask(1000, 1)
	if l1.High-l1.Low >= l0.High-l0.Low {
		t.Errorf("a better Scouting facility must narrow the band: %+v vs %+v", l1, l0)
	}
	l9 := Mask(1000, 9) // floors at spread 3
	if l9.Low != 997 || l9.High != 1003 {
		t.Errorf("masked floor = %+v, want {997,1003}", l9)
	}
}

func TestMaskAlwaysReveals(t *testing.T) {
	for level := 0; level <= 6; level++ {
		b := Mask(742, level)
		if !Reveals(b, 742) {
			t.Errorf("level %d band %+v must contain the true rating", level, b)
		}
	}
}

func TestCost(t *testing.T) {
	if got := Cost(50, 0); got != 50 {
		t.Errorf("Cost(50,0) = %d, want 50", got)
	}
	if got := Cost(50, 3); got != 20 {
		t.Errorf("Cost(50,3) = %d, want 20", got)
	}
	if got := Cost(50, 9); got != 0 {
		t.Errorf("Cost must floor at 0, got %d", got)
	}
}

// TestMaskNeverLeaksOrInverts sweeps a wide rating/level grid: the band must
// always be well-formed, always contain the true rating, and never collapse to a
// single value (the masking contract).
func TestMaskNeverLeaksOrInverts(t *testing.T) {
	ratings := []int{-100, 0, 1, 500, 1000, 5000, 100000}
	for _, rating := range ratings {
		for level := -5; level <= 20; level++ {
			b := Mask(rating, level)
			if b.Low > b.High {
				t.Fatalf("Mask(%d,%d) inverted: %+v", rating, level, b)
			}
			if b.High-b.Low < 6 {
				t.Fatalf("Mask(%d,%d) leaks a near-exact rating: %+v", rating, level, b)
			}
			if !Reveals(b, rating) {
				t.Fatalf("Mask(%d,%d) %+v must contain the true rating", rating, level, b)
			}
		}
	}
}

// TestCostNonIncreasing guards the deep-report cost: it never rises with the
// Scouting level and never goes negative.
func TestCostNonIncreasing(t *testing.T) {
	prev := Cost(100, -10)
	for level := -9; level <= 20; level++ {
		c := Cost(100, level)
		if c > prev {
			t.Fatalf("Cost rose at level %d: %d after %d", level, c, prev)
		}
		if c < 0 {
			t.Fatalf("Cost(100,%d) = %d, must be >= 0", level, c)
		}
		prev = c
	}
}
