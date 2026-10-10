package campus

import (
	"math"
	"testing"
	"time"
)

func TestUpgradeTimeCurve(t *testing.T) {
	cases := []struct {
		base, growth float64
		level        int
		want         float64
	}{
		{20, 2, 0, 20},
		{20, 2, 1, 20},
		{20, 2, 2, 40},
		{20, 2, 3, 80},
		{60, 2.4, 4, 60 * math.Pow(2.4, 3)},
	}
	for _, c := range cases {
		if got := UpgradeTime(c.base, c.growth, c.level); math.Abs(got-c.want) > 1e-9 {
			t.Errorf("UpgradeTime(%v,%v,%d) = %v, want %v", c.base, c.growth, c.level, got, c.want)
		}
	}
}

func TestUpgradeMinutesScaledByGameTimeScale(t *testing.T) {
	// Larger scale = game time runs faster = fewer real minutes.
	if got := UpgradeMinutesScaled(60, 2, 3, 2); got != 120 {
		t.Errorf("scale 2 = %v, want 120", got)
	}
	if got := UpgradeMinutesScaled(60, 2, 3, 1); got != 240 {
		t.Errorf("scale 1 = %v, want 240", got)
	}
	// A zero/negative scale is treated as 1 (no division by zero).
	if got := UpgradeMinutesScaled(60, 2, 2, 0); got != 120 {
		t.Errorf("scale 0 = %v, want 120", got)
	}
}

func TestGameTimeScaleParsing(t *testing.T) {
	cases := map[string]float64{
		"":      1,
		"  ":    1,
		"2":     2,
		"0.5":   0.5,
		"0":     1,
		"-3":    1,
		"0.001": 1,
		"nope":  1,
	}
	for raw, want := range cases {
		if got := GameTimeScale(raw); got != want {
			t.Errorf("GameTimeScale(%q) = %v, want %v", raw, got, want)
		}
	}
}

func TestVaultCapacityForTier(t *testing.T) {
	if got := VaultCapacityForTier(10000, 2, 0, 3); got != 0 {
		t.Errorf("level 0 = %v, want 0", got)
	}
	// tier 1 has no factor.
	if got := VaultCapacityForTier(10000, 2, 1, 1); got != 10000 {
		t.Errorf("tier 1 = %v, want 10000", got)
	}
	// 5% per tier above 1: tier 3 => x1.10.
	if got := VaultCapacityForTier(10000, 2, 1, 3); math.Abs(got-11000) > 1e-9 {
		t.Errorf("tier 3 = %v, want 11000", got)
	}
	// A tier below 1 is clamped to 1.
	if got := VaultCapacityForTier(10000, 2, 1, 0); got != 10000 {
		t.Errorf("tier 0 = %v, want 10000", got)
	}
}

func TestAccrueScaled(t *testing.T) {
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	c := Collector{RatePerHour: 1000, Capacity: 5000}
	if got := AccrueScaled(c, now.Add(-time.Hour), now, 1); got != 1000 {
		t.Errorf("scale 1 = %v, want 1000", got)
	}
	if got := AccrueScaled(c, now.Add(-time.Hour), now, 2); got != 2000 {
		t.Errorf("scale 2 = %v, want 2000", got)
	}
	// Scale cannot push past the cap.
	if got := AccrueScaled(c, now.Add(-time.Hour), now, 100); got != 5000 {
		t.Errorf("capped = %v, want 5000", got)
	}
	// A bad scale is 1, and backwards time is 0.
	if got := AccrueScaled(c, now.Add(-time.Hour), now, 0); got != 1000 {
		t.Errorf("scale 0 = %v, want 1000", got)
	}
	if got := AccrueScaled(c, now, now.Add(-time.Hour), 1); got != 0 {
		t.Errorf("backwards = %v, want 0", got)
	}
}

func TestCollectorCapacityAndRate(t *testing.T) {
	def, _ := collectorByKeyForTest("turnstiles")
	if got := CollectorRate(def, 0); got != 0 {
		t.Errorf("level 0 rate = %v, want 0", got)
	}
	if got := CollectorRate(def, 3); got != 1800 {
		t.Errorf("level 3 rate = %v, want 1800", got)
	}
	// Capacity = rate * 8h * vault growth * tier factor.
	got := CollectorCapacity(def, 1, 2, 1)
	want := CollectorRate(def, 1) * CollectorStorageHours * 2
	if math.Abs(got-want) > 1e-9 {
		t.Errorf("capacity = %v, want %v", got, want)
	}
	// A missing vault still holds the base hours (level clamped to 1).
	if got := CollectorCapacity(def, 1, 0, 1); got != CollectorRate(def, 1)*CollectorStorageHours {
		t.Errorf("no-vault capacity = %v", got)
	}
	if got := CollectorCapacity(def, 0, 3, 5); got != 0 {
		t.Errorf("level 0 capacity = %v, want 0", got)
	}
}

func collectorByKeyForTest(key string) (CollectorDef, bool) {
	for _, def := range Collectors {
		if def.Key == key {
			return def, true
		}
	}
	return CollectorDef{}, false
}

func TestGroundskeeperPrice(t *testing.T) {
	cases := map[int]struct {
		price float64
		ok    bool
	}{
		1: {0, false},
		3: {0, false},
		4: {500, true},
		5: {1000, true},
		6: {0, false},
		7: {0, false},
	}
	for n, want := range cases {
		price, ok := GroundskeeperPrice(n)
		if ok != want.ok || price != want.price {
			t.Errorf("GroundskeeperPrice(%d) = (%v,%v), want (%v,%v)", n, price, ok, want.price, want.ok)
		}
	}
}

func TestFacilityUpgradeCostAndMinutes(t *testing.T) {
	def, ok := FacilityDefFor("club_shop")
	if !ok {
		t.Fatal("club_shop must exist")
	}
	if got := UpgradeCostFor(def, 1); got != def.BaseCost {
		t.Errorf("level 1 cost = %v, want %v", got, def.BaseCost)
	}
	if got := UpgradeCostFor(def, 3); got != math.Round(def.BaseCost*math.Pow(def.CostGrowth, 2)) {
		t.Errorf("level 3 cost = %v", got)
	}
	if got := UpgradeMinutesFor(def, 1, 1); math.Abs(got-def.BaseMinutes) > 1e-9 {
		t.Errorf("level 1 minutes = %v, want %v", got, def.BaseMinutes)
	}
	if _, ok := FacilityDefFor("nope"); ok {
		t.Error("unknown facility must not resolve")
	}
}

func TestObstacleDefs(t *testing.T) {
	def, ok := ObstacleDefFor("weeds")
	if !ok || def.ClearCost != 500 || def.BonusFans != 50 {
		t.Fatalf("weeds = %+v ok=%v", def, ok)
	}
	if _, ok := ObstacleDefFor("nope"); ok {
		t.Error("unknown obstacle must not resolve")
	}
}
