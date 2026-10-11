package matchrating

import (
	"math"
	"testing"
)

// TestStarsBoundaries pins the exact 02 §D rule, including the boundary values
// the audit brief calls out: negative GD, D exactly 0.6, draws, and a clean
// sheet true/false at a 2-goal win.
func TestStarsBoundaries(t *testing.T) {
	cases := []struct {
		name       string
		gf, ga     int
		dominance  float64
		cleanSheet bool
		want       int
	}{
		{"heavy loss", 0, 5, 0.9, false, 0},
		{"heavy loss low dominance", 0, 5, 0.0, false, 0},
		{"draw dominant", 2, 2, 0.95, false, 1},
		{"draw low dominance", 0, 0, 0.1, true, 1},
		{"narrow win below threshold", 1, 0, 0.5999, true, 1},
		{"narrow win exactly at threshold", 1, 0, DominanceThreshold, true, 2},
		{"narrow win above threshold", 1, 0, 0.61, true, 2},
		{"win by 2 below threshold", 2, 0, 0.5999, true, 2},
		{"win by 2 at threshold clean sheet", 2, 0, DominanceThreshold, true, 3},
		{"win by 2 at threshold no clean sheet", 2, 0, DominanceThreshold, false, 2},
		{"win by 2 above threshold conceded", 2, 1, 0.9, false, 2},
		{"win by 3 low dominance", 3, 0, 0.0, false, 3},
		{"win by 3 conceded", 4, 1, 0.3, false, 3},
	}
	for _, c := range cases {
		if got := Stars(c.gf, c.ga, c.dominance, c.cleanSheet); got != c.want {
			t.Errorf("%s: Stars(%d,%d,%.4f,%v) = %d, want %d",
				c.name, c.gf, c.ga, c.dominance, c.cleanSheet, got, c.want)
		}
	}
}

func TestDominanceClampsAndHandlesEmpty(t *testing.T) {
	if got := Dominance(0, 0, 0, 0); got != 0.5 {
		t.Errorf("no data = %v, want 0.5", got)
	}
	if got := Dominance(-10, -10, -1, -1); got != 0.5 {
		t.Errorf("negative totals = %v, want 0.5", got)
	}
	if got := Dominance(100, 0, 5, 0); got != 1 {
		t.Errorf("total dominance = %v, want 1", got)
	}
	if got := Dominance(0, 100, 0, 5); got != 0 {
		t.Errorf("no dominance = %v, want 0", got)
	}
	// Result stays inside [0,1] and is never NaN for sane inputs.
	for _, tc := range [][4]float64{{1, 2, 3, 4}, {0, 0, 1, 0}, {7, 3, 0, 0}} {
		d := Dominance(tc[0], tc[1], tc[2], tc[3])
		if d < 0 || d > 1 || math.IsNaN(d) {
			t.Errorf("Dominance(%v) = %v out of [0,1]", tc, d)
		}
	}
}
