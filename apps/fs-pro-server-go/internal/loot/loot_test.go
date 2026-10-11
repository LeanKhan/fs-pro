package loot

import "testing"

func TestRate(t *testing.T) {
	if got := Rate(1500, 6, 1000); got != 7500 {
		t.Errorf("Rate = %v, want 7500", got)
	}
	if got := Rate(1500, 6, 0); got != 1500 {
		t.Errorf("Rate with no units = %v, want 1500 (base)", got)
	}
}

func TestVaultStealable(t *testing.T) {
	if got := VaultStealable(100000); got != 3000 {
		t.Errorf("VaultStealable(100000) = %d, want 3000 (3%%)", got)
	}
	if got := VaultStealable(0); got != 0 {
		t.Errorf("empty vault stealable = %d, want 0", got)
	}
	if got := VaultStealable(-5); got != 0 {
		t.Errorf("negative vault stealable = %d, want 0", got)
	}
}

func TestRaidLoot(t *testing.T) {
	if got := RaidLoot(50000, 2000, 40000); got != 10000 {
		t.Errorf("20%% of 50000 = %d, want 10000", got)
	}
	if got := RaidLoot(50000, 9000, 40000); got != 40000 {
		t.Errorf("loot must cap at 40000, got %d", got)
	}
	if got := RaidLoot(50000, 0, 40000); got != 0 {
		t.Errorf("zero share = %d, want 0", got)
	}
	if got := RaidLoot(50000, 2000, 0); got != 10000 {
		t.Errorf("no cap = %d, want 10000", got)
	}
}

func TestLeagueBonus(t *testing.T) {
	if got := LeagueBonus(1000, 210); got != 2100 {
		t.Errorf("x2.10 of 1000 = %d, want 2100", got)
	}
	if got := LeagueBonus(1000, 0); got != 0 {
		t.Errorf("zero multiplier = %d, want 0", got)
	}
}
