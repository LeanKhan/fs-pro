package loot

import (
	"math"
	"testing"
)

// TestCollectorTierMultipliers pins the 04 §3.1 collector tier factors:
// Cash scales with the Clubhouse tier at +5% each, Fans with the Club Shop
// level at +8% each (OW-P12).
func TestCollectorTierMultipliers(t *testing.T) {
	near := func(a, b float64) bool { return math.Abs(a-b) < 1e-9 }
	cases := []struct {
		name string
		got  float64
		want float64
	}{
		{"cash tier 1", CashRateMultiplier(1), 1.05},
		{"cash tier 4", CashRateMultiplier(4), 1.20},
		{"cash tier 0", CashRateMultiplier(0), 1.0},
		{"cash negative tier clamps", CashRateMultiplier(-3), 1.0},
		{"fan shop 0", FanRateMultiplier(0), 1.0},
		{"fan shop 5", FanRateMultiplier(5), 1.40},
		{"fan negative level clamps", FanRateMultiplier(-2), 1.0},
		{"generic", TierMultiplier(3, 0.1), 1.30},
	}
	for _, c := range cases {
		if !near(c.got, c.want) {
			t.Errorf("%s = %v, want %v", c.name, c.got, c.want)
		}
	}
}

// TestRateTiered proves RateTiered is Rate scaled by the multiplier and that a
// missing/zero multiplier is a no-op (so no caller can accidentally zero a
// collector's income by omitting the tier).
func TestRateTiered(t *testing.T) {
	// Rate(1500,6,1000) = 7500; a x1.5 factor is 11250.
	if got := RateTiered(1500, 6, 1000, 1.5); got != 11250 {
		t.Errorf("RateTiered x1.5 = %v, want 11250", got)
	}
	// multiplier 1 reproduces Rate exactly (old callers stay bit-identical).
	if got := RateTiered(1500, 6, 1000, 1); got != Rate(1500, 6, 1000) {
		t.Errorf("RateTiered x1 = %v, want Rate %v", got, Rate(1500, 6, 1000))
	}
	// A zero / negative multiplier is treated as 1.
	if got := RateTiered(1500, 6, 1000, 0); got != 7500 {
		t.Errorf("RateTiered x0 = %v, want 7500 (no-op)", got)
	}
	if got := RateTiered(1500, 6, 1000, -3); got != 7500 {
		t.Errorf("RateTiered negative = %v, want 7500 (no-op)", got)
	}
	// Composing with the named cash multiplier is the intended campus wiring.
	want := Rate(1500, 6, 1000) * CashRateMultiplier(4)
	if got := RateTiered(1500, 6, 1000, CashRateMultiplier(4)); math.Abs(got-want) > 1e-9 {
		t.Errorf("RateTiered(cash tier 4) = %v, want %v", got, want)
	}
}
