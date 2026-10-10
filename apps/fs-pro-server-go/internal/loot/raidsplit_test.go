package loot

import "testing"

// TestStarShareBp pins the star → steal-share table and its clamping (04 §5.1;
// the star-rating input the Batch-0 audit found missing).
func TestStarShareBp(t *testing.T) {
	cases := []struct{ stars, want int }{
		{-3, 0},
		{0, 0},
		{1, 2000},
		{2, 3500},
		{3, 5000},
		{4, 5000}, // clamped
	}
	for _, c := range cases {
		if got := StarShareBp(c.stars); got != c.want {
			t.Errorf("StarShareBp(%d) = %d, want %d", c.stars, got, c.want)
		}
	}
}

func TestStarBonus(t *testing.T) {
	// No stars → no bonus even at a high league.
	if got := StarBonus(0, 210); got != 0 {
		t.Errorf("StarBonus(0) = %d, want 0", got)
	}
	// A 3★ raid at x2.10 league: 15000 · 210 / 100 = 31500.
	if got := StarBonus(3, 210); got != 31500 {
		t.Errorf("StarBonus(3, 210) = %d, want 31500", got)
	}
	// A zero/negative multiplier earns nothing.
	if got := StarBonus(3, 0); got != 0 {
		t.Errorf("StarBonus(3, 0) = %d, want 0", got)
	}
	// Stars clamp: a 9★ (impossible) behaves as 3★.
	if got := StarBonus(9, 100); got != 15000 {
		t.Errorf("StarBonus(9, 100) = %d, want 15000", got)
	}
}

func TestRaidLootForStars(t *testing.T) {
	// 2★ steals 35% of 100000 = 35000, then x1.40 league = 49000.
	if got := RaidLootForStars(100000, 2, 140, 0); got != 49000 {
		t.Errorf("RaidLootForStars = %d, want 49000", got)
	}
	// A defeat takes nothing, whatever the holdings or league.
	if got := RaidLootForStars(500000, 0, 210, 0); got != 0 {
		t.Errorf("0★ loot = %d, want 0", got)
	}
	// The cap is honoured after the league multiplier.
	if got := RaidLootForStars(100000, 3, 200, 40000); got != 40000 {
		t.Errorf("capped = %d, want 40000", got)
	}
	// Empty / negative holdings and a bad multiplier earn nothing.
	if got := RaidLootForStars(0, 3, 200, 0); got != 0 {
		t.Errorf("empty holdings = %d, want 0", got)
	}
	if got := RaidLootForStars(1000, 3, 0, 0); got != 0 {
		t.Errorf("zero multiplier = %d, want 0", got)
	}
}

// TestRaidSplit pins the stolen/system-paid split: only the stolen half is taken
// from the defender; the star bonus is paid by the system (04 §5.1).
func TestRaidSplit(t *testing.T) {
	stolen, bonus := RaidSplit(100000, 3, 100, 0)
	if stolen != 50000 {
		t.Errorf("stolen = %d, want 50000", stolen)
	}
	if bonus != 15000 {
		t.Errorf("system-paid = %d, want 15000", bonus)
	}
	// Split always equals the two component functions.
	for _, stars := range []int{0, 1, 2, 3} {
		s, b := RaidSplit(77777, stars, 175, 30000)
		if s != RaidLootForStars(77777, stars, 175, 30000) || b != StarBonus(stars, 175) {
			t.Fatalf("RaidSplit(%d) disagrees with components: %d/%d", stars, s, b)
		}
	}
}

func TestBoardVaultCapacity(t *testing.T) {
	cases := []struct{ tier, want int }{
		{0, 100_000}, // clamped to tier 1
		{1, 100_000},
		{2, 150_000},
		{5, 300_000},
		{9, 500_000}, // no upper clamp: capacity grows with the campus
	}
	for _, c := range cases {
		if got := BoardVaultCapacity(c.tier); got != c.want {
			t.Errorf("BoardVaultCapacity(%d) = %d, want %d", c.tier, got, c.want)
		}
	}
}
