package association

import (
	"testing"
	"time"
)

func TestLevelForXp(t *testing.T) {
	cases := []struct {
		xp    int
		level int
	}{
		{0, 1}, {-100, 1}, {999, 1}, {1000, 2}, {2999, 2}, {3000, 3}, {6000, 4},
	}
	for _, c := range cases {
		if got := LevelForXp(c.xp); got != c.level {
			t.Errorf("LevelForXp(%d) = %d, want %d", c.xp, got, c.level)
		}
	}
	if XpForLevel(1) != 0 {
		t.Fatal("level 1 needs no XP")
	}
	if LevelForXp(XpForLevel(5)) != 5 {
		t.Fatal("LevelForXp/XpForLevel must be inverse at the boundary")
	}
}

func TestRankGroupAndZones(t *testing.T) {
	in := []LeagueStanding{
		{AssociationID: "c", Stars: 10},
		{AssociationID: "a", Stars: 12},
		{AssociationID: "b", Stars: 12},
		{AssociationID: "d", Stars: 5},
		{AssociationID: "e", Stars: 4},
		{AssociationID: "f", Stars: 3},
		{AssociationID: "g", Stars: 2},
		{AssociationID: "h", Stars: 1},
	}
	ranked := RankGroup(in)
	if ranked[0].AssociationID != "a" || ranked[1].AssociationID != "b" || ranked[2].AssociationID != "c" {
		t.Fatalf("ranking wrong: %+v", ranked)
	}
	// Equal stars break by id ascending (deterministic).
	for i := range ranked {
		placement := i + 1
		wantPromote := placement <= LeaguePromote
		if Promoted(placement) != wantPromote {
			t.Errorf("placement %d promote = %v", placement, Promoted(placement))
		}
		wantRelegate := placement > len(ranked)-LeagueRelegate
		if Relegated(placement, len(ranked)) != wantRelegate {
			t.Errorf("placement %d relegate = %v", placement, Relegated(placement, len(ranked)))
		}
	}
	// A bracket too small to relegate two safely relegates nobody.
	if Relegated(4, 4) {
		t.Fatal("a 4-association bracket must not relegate")
	}
}

func TestGroupIndexFor(t *testing.T) {
	cases := map[int]int{0: 0, 7: 0, 8: 1, 9: 1, 15: 1, 16: 2}
	for i, want := range cases {
		if got := GroupIndexFor(i); got != want {
			t.Errorf("GroupIndexFor(%d) = %d, want %d", i, got, want)
		}
	}
}

func TestCanClaimTier(t *testing.T) {
	cases := []struct {
		progress, goal, claimed, tier int
		want                          bool
	}{
		{10, 5, 0, 1, true},
		{4, 5, 0, 1, false},  // goal not reached
		{10, 5, 1, 1, false}, // already claimed this tier
		{10, 5, 1, 2, true},  // a higher tier is claimable
		{10, 5, 3, 2, false}, // already ahead of the tier
		{10, 5, 0, 0, false}, // invalid tier
	}
	for _, c := range cases {
		if got := CanClaimTier(c.progress, c.goal, c.claimed, c.tier); got != c.want {
			t.Errorf("CanClaimTier(%d,%d,%d,%d) = %v, want %v",
				c.progress, c.goal, c.claimed, c.tier, got, c.want)
		}
	}
}

func TestWeeklyKey(t *testing.T) {
	// 2026-10-10 is a Saturday in ISO week 41.
	if got := WeeklyKey(time.Date(2026, time.October, 10, 12, 0, 0, 0, time.UTC)); got != "2026-W41" {
		t.Fatalf("WeeklyKey = %q, want 2026-W41", got)
	}
	// The key is stable regardless of the caller's zone (evaluated in UTC).
	ny := time.FixedZone("UTC-5", -5*3600)
	if got := WeeklyKey(time.Date(2026, time.October, 10, 1, 0, 0, 0, ny)); got != "2026-W41" {
		t.Fatalf("WeeklyKey (zoned instant) = %q, want 2026-W41", got)
	}
}

func TestGroundsUpgradeCost(t *testing.T) {
	if GroundsUpgradeCost(1) != 500 {
		t.Fatalf("GroundsUpgradeCost(1) = %d, want 500", GroundsUpgradeCost(1))
	}
	if GroundsUpgradeCost(2) != 1000 {
		t.Fatalf("GroundsUpgradeCost(2) = %d, want 1000", GroundsUpgradeCost(2))
	}
	if GroundsUpgradeCost(GroundsMaxLevel) != 0 {
		t.Fatal("the max level must cost nothing to upgrade past")
	}
}

// TestFestivalWindowConsistentWithActive pins FestivalWindow to FestivalActive:
// the window is exactly [open, close) and active iff now is inside it.
func TestFestivalWindowConsistentWithActive(t *testing.T) {
	instants := []time.Time{
		time.Date(2026, time.October, 9, 6, 59, 0, 0, time.UTC),   // Fri before open
		time.Date(2026, time.October, 9, 7, 0, 0, 0, time.UTC),    // Fri open
		time.Date(2026, time.October, 10, 12, 0, 0, 0, time.UTC),  // Sat
		time.Date(2026, time.October, 12, 6, 59, 59, 0, time.UTC), // Mon before close
		time.Date(2026, time.October, 12, 7, 0, 0, 0, time.UTC),   // Mon close
		time.Date(2026, time.October, 13, 12, 0, 0, 0, time.UTC),  // Tue
	}
	for _, now := range instants {
		open, close := FestivalWindow(now)
		if close.Sub(open) != 72*time.Hour {
			t.Errorf("window duration at %s = %s, want 72h", now, close.Sub(open))
		}
		inside := !now.Before(open) && now.Before(close)
		if inside != FestivalActive(now) {
			t.Errorf("at %s: inside-window %v != FestivalActive %v", now, inside, FestivalActive(now))
		}
	}
}
