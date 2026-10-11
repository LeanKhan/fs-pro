package loot

import "testing"

func TestRateEdges(t *testing.T) {
	if got := Rate(0, 0, 100); got != 0 {
		t.Errorf("zero rate = %v, want 0", got)
	}
	if got := Rate(100, 0.5, 10); got != 105 {
		t.Errorf("fractional rate = %v, want 105", got)
	}
}

func TestVaultStealableBoundaries(t *testing.T) {
	cases := []struct{ vault, want int }{
		{0, 0},
		{1, 0}, // 3/100 truncates to 0
		{33, 0},
		{34, 1}, // 102/100
		{100, 3},
		{1_000_000, 30000},
	}
	for _, c := range cases {
		if got := VaultStealable(c.vault); got != c.want {
			t.Errorf("VaultStealable(%d) = %d, want %d", c.vault, got, c.want)
		}
	}
}

func TestRaidLootBoundaries(t *testing.T) {
	if got := RaidLoot(0, 2000, 40000); got != 0 {
		t.Errorf("empty holdings = %d, want 0", got)
	}
	if got := RaidLoot(-100, 2000, 40000); got != 0 {
		t.Errorf("negative holdings = %d, want 0", got)
	}
	if got := RaidLoot(50000, -1, 40000); got != 0 {
		t.Errorf("negative share = %d, want 0", got)
	}
	// Exactly at the cap is not clamped down.
	if got := RaidLoot(10000, 10000, 10000); got != 10000 {
		t.Errorf("share exactly at cap = %d, want 10000", got)
	}
	// Integer division truncates toward zero.
	if got := RaidLoot(3, 3333, 0); got != 0 {
		t.Errorf("truncation = %d, want 0", got)
	}
}

func TestLeagueBonusBoundaries(t *testing.T) {
	if got := LeagueBonus(0, 210); got != 0 {
		t.Errorf("zero base = %d, want 0", got)
	}
	if got := LeagueBonus(-5, 210); got != 0 {
		t.Errorf("negative base = %d, want 0", got)
	}
	if got := LeagueBonus(1000, -1); got != 0 {
		t.Errorf("negative multiplier = %d, want 0", got)
	}
	if got := LeagueBonus(1000, 100); got != 1000 {
		t.Errorf("x1.00 = %d, want 1000", got)
	}
	if got := LeagueBonus(1000, 99); got != 990 {
		t.Errorf("x0.99 = %d, want 990", got)
	}
}
