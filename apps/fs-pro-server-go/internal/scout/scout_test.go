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
