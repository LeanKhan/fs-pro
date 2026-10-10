package campus

import (
	"testing"
	"time"
)

func TestGroundskeepersForTier(t *testing.T) {
	cases := map[int]int{0: 1, 1: 1, 2: 2, 3: 3, 4: 3, 5: 3}
	for tier, want := range cases {
		if got := GroundskeepersForTier(tier); got != want {
			t.Errorf("GroundskeepersForTier(%d) = %d, want %d", tier, got, want)
		}
	}
}

func TestCanStartUpgrade(t *testing.T) {
	cases := []struct {
		active, keepers int
		want            bool
	}{
		{0, 1, true},
		{1, 1, false},
		{1, 2, true},
		{2, 2, false},
		{0, 0, false},
		{5, 9, true}, // keeper count is capped at MaxGroundskeepers (6)
	}
	for _, c := range cases {
		if got := CanStartUpgrade(c.active, c.keepers); got != c.want {
			t.Errorf("CanStartUpgrade(%d,%d) = %v, want %v", c.active, c.keepers, got, c.want)
		}
	}
}

func TestAccrue(t *testing.T) {
	now := time.Now()
	c := Collector{RatePerHour: 1000, Capacity: 5000}
	if got := Accrue(c, now.Add(-3*time.Hour), now); got != 3000 {
		t.Errorf("3h accrual = %v, want 3000", got)
	}
	if got := Accrue(c, now.Add(-10*time.Hour), now); got != 5000 {
		t.Errorf("10h accrual = %v, want 5000 (capped)", got)
	}
	if got := Accrue(c, now.Add(time.Hour), now); got != 0 {
		t.Errorf("future start = %v, want 0", got)
	}
}

func TestVaultCapacity(t *testing.T) {
	if got := VaultCapacity(10000, 2, 0); got != 0 {
		t.Errorf("level 0 vault = %v, want 0", got)
	}
	if got := VaultCapacity(10000, 2, 1); got != 10000 {
		t.Errorf("level 1 vault = %v, want 10000", got)
	}
	if got := VaultCapacity(10000, 2, 3); got != 40000 {
		t.Errorf("level 3 vault = %v, want 40000", got)
	}
}

func TestUpgradeCostCurve(t *testing.T) {
	if got := UpgradeCost(100, 2, 1); got != 100 {
		t.Errorf("level 1 cost = %v, want 100", got)
	}
	if got := UpgradeCost(100, 2, 3); got != 400 {
		t.Errorf("level 3 cost = %v, want 400", got)
	}
}

func TestFacilityCurrencyIsCrossed(t *testing.T) {
	if FacilityCurrency["turnstiles"] != Fans {
		t.Errorf("the Cash producer must cost Fans, got %s", FacilityCurrency["turnstiles"])
	}
	if FacilityCurrency["club_shop"] != Cash {
		t.Errorf("the Fans producer must cost Cash, got %s", FacilityCurrency["club_shop"])
	}
	if FacilityCurrency["cash_vault"] != Fans || FacilityCurrency["fan_vault"] != Cash {
		t.Errorf("vault costs must be crossed")
	}
}

func TestClubhouseGate(t *testing.T) {
	if ok, _ := CanUpgradeClubhouse(1, nil); !ok {
		t.Error("tier 1 is the start, should be allowed")
	}
	if ok, missing := CanUpgradeClubhouse(2, map[string]int{}); ok || len(missing) != 2 {
		t.Errorf("tier 2 with an empty campus: ok=%v missing=%v, want false / 2", ok, missing)
	}
	met := map[string]int{"stands": 1, "training_ground": 1}
	if ok, missing := CanUpgradeClubhouse(2, met); !ok || len(missing) != 0 {
		t.Errorf("tier 2 met: ok=%v missing=%v, want true / 0", ok, missing)
	}
	partial := map[string]int{"stands": 1} // training_ground missing
	if ok, missing := CanUpgradeClubhouse(2, partial); ok || len(missing) != 1 || missing[0].Facility != "training_ground" {
		t.Errorf("partial tier 2: ok=%v missing=%v", ok, missing)
	}
	if ok, _ := CanUpgradeClubhouse(6, met); ok {
		t.Error("tier above MaxClubhouseTier must be refused")
	}
}
