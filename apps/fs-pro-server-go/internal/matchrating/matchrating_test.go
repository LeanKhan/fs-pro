package matchrating

import (
	"math"
	"testing"
)

func TestDominance(t *testing.T) {
	if got := Dominance(50, 50, 1, 1); got != 0.5 {
		t.Errorf("even match dominance = %v, want 0.5", got)
	}
	// 60/40 possession, 2 vs 1 xG: 0.5*0.6 + 0.5*(2/3).
	want := 0.5*0.6 + 0.5*(2.0/3.0)
	if got := Dominance(60, 40, 2, 1); math.Abs(got-want) > 1e-9 {
		t.Errorf("dominance = %v, want %v", got, want)
	}
	if got := Dominance(0, 0, 0, 0); got != 0.5 {
		t.Errorf("no data dominance = %v, want 0.5", got)
	}
}

func TestStars(t *testing.T) {
	cases := []struct {
		gf, ga     int
		dominance  float64
		cleanSheet bool
		want       int
	}{
		{0, 1, 0.7, false, 0},  // defeat is always 0 stars
		{1, 1, 0.9, false, 1},  // a draw is 1 star however dominant
		{1, 0, 0.50, true, 1},  // narrow win without command
		{1, 0, 0.70, true, 2},  // narrow win with command
		{2, 1, 0.65, false, 2}, // won by 1 with command
		{2, 0, 0.50, true, 2},  // won by 2 but no command -> 2
		{2, 0, 0.70, true, 3},  // won by 2, command + clean sheet -> 3
		{2, 0, 0.70, false, 2}, // same but conceded -> 2
		{3, 0, 0.40, false, 3}, // won by 3 is always 3
		{3, 2, 0.70, false, 2}, // won by 1 with command
	}
	for _, c := range cases {
		if got := Stars(c.gf, c.ga, c.dominance, c.cleanSheet); got != c.want {
			t.Errorf("Stars(%d,%d,%v,%v) = %d, want %d", c.gf, c.ga, c.dominance, c.cleanSheet, got, c.want)
		}
	}
}
