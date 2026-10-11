package league

import (
	"regexp"
	"testing"
	"time"
)

// TestLeagueCodesMatchSeed pins every rung code to the 0048_ladder seed, so the
// pure core and the database cannot drift.
func TestLeagueCodesMatchSeed(t *testing.T) {
	want := []string{
		"bronze_3", "bronze_2", "bronze_1",
		"silver_3", "silver_2", "silver_1",
		"gold_3", "gold_2", "gold_1",
		"crystal_3", "crystal_2", "crystal_1",
		"master_3", "master_2", "master_1",
		"champion_3", "champion_2", "champion_1",
		"titan_3", "titan_2", "titan_1",
		"legend",
	}
	if len(Leagues) != len(want) {
		t.Fatalf("rungs = %d, want %d", len(Leagues), len(want))
	}
	for i, code := range want {
		if got := Leagues[i].Code(); got != code {
			t.Errorf("rung %d code = %q, want %q", i, got, code)
		}
		if got := LeagueByCode(code); got != i {
			t.Errorf("LeagueByCode(%q) = %d, want %d", code, got, i)
		}
	}
	if got := LeagueByCode("unranked"); got != -1 {
		t.Errorf("LeagueByCode(unranked) = %d, want -1", got)
	}
	if got := Unranked.Code(); got != "unranked" {
		t.Errorf("Unranked.Code() = %q, want unranked", got)
	}
}

func TestApexAndResetFloor(t *testing.T) {
	if !IsApex(ApexIndex()) {
		t.Fatal("ApexIndex must be the apex")
	}
	if IsApex(0) {
		t.Fatal("the lowest rung is not the apex")
	}
	if got := ResetFloor(ApexIndex()); got != 3200 {
		t.Errorf("apex floor = %d, want 3200", got)
	}
	if got := ResetFloor(0); got != 400 {
		t.Errorf("Bronze III floor = %d, want 400", got)
	}
	if got := ResetFloor(-1); got != 0 {
		t.Errorf("unranked floor = %d, want 0", got)
	}
	if got := ResetFloor(len(Leagues)); got != 0 {
		t.Errorf("out-of-range floor = %d, want 0", got)
	}
}

func TestPoolsNeeded(t *testing.T) {
	cases := []struct{ n, want int }{
		{0, 0}, {-5, 0}, {1, 1}, {100, 1}, {101, 2}, {250, 3}, {1000, 10},
	}
	for _, c := range cases {
		if got := PoolsNeeded(c.n); got != c.want {
			t.Errorf("PoolsNeeded(%d) = %d, want %d", c.n, got, c.want)
		}
	}
}

func TestNextPoolIndex(t *testing.T) {
	cases := []struct {
		fill []int
		want int
	}{
		{nil, 0},
		{[]int{0}, 0},
		{[]int{99}, 0},
		{[]int{100}, 1},
		{[]int{100, 100}, 2},
		{[]int{100, 3, 100}, 1},
		{[]int{PoolSize - 1, PoolSize}, 0},
	}
	for _, c := range cases {
		if got := NextPoolIndex(c.fill); got != c.want {
			t.Errorf("NextPoolIndex(%v) = %d, want %d", c.fill, got, c.want)
		}
	}
}

// TestPlacementIsDeterministic checks the ranking is by stars descending with a
// ClubID tiebreak, so the same pool always yields the same placements.
func TestPlacementIsDeterministic(t *testing.T) {
	entries := []PoolEntry{
		{ClubID: "c", Stars: 5}, {ClubID: "a", Stars: 9},
		{ClubID: "b", Stars: 5}, {ClubID: "d", Stars: 1},
	}
	got := Placement(entries)
	if got["a"] != 1 || got["b"] != 2 || got["c"] != 3 || got["d"] != 4 {
		t.Fatalf("placements = %v, want a=1 b=2 c=3 d=4", got)
	}
	// Reversed input order must not change the result (determinism).
	reversed := []PoolEntry{entries[3], entries[2], entries[1], entries[0]}
	got2 := Placement(reversed)
	for id, p := range got {
		if got2[id] != p {
			t.Fatalf("placement drifted for %s: %d vs %d", id, p, got2[id])
		}
	}
}

func TestPlacementOutcome(t *testing.T) {
	cases := []struct {
		name             string
		index, placement int
		poolSize         int
		wantIndex        int
		wantOutcome      string
	}{
		{"top promotes", 4, 1, 10, 5, OutcomePromoted},
		{"second holds", 4, 2, 10, 4, OutcomeHeld},
		{"middle holds", 4, 5, 10, 4, OutcomeHeld},
		{"ninth holds", 4, 9, 10, 4, OutcomeHeld},
		{"bottom relegates", 4, 10, 10, 3, OutcomeRelegated},
		{"apex never promotes", ApexIndex(), 1, 10, ApexIndex(), OutcomeHeld},
		{"lowest rung cannot relegate", 0, 10, 10, 0, OutcomeHeld},
		{"unranked promotes into the lowest rung", -1, 1, 10, 0, OutcomePromoted},
		{"pool too small holds (9)", 4, 1, 9, 4, OutcomeHeld},
		{"pool of 100 top promotes", 4, 1, 100, 5, OutcomePromoted},
		{"pool of 100 10th promotes", 4, 10, 100, 5, OutcomePromoted},
		{"pool of 100 11th holds", 4, 11, 100, 4, OutcomeHeld},
		{"pool of 100 90th holds", 4, 90, 100, 4, OutcomeHeld},
		{"pool of 100 91st relegates", 4, 91, 100, 3, OutcomeRelegated},
		{"empty pool holds", 4, 1, 0, 4, OutcomeHeld},
	}
	for _, c := range cases {
		gotIndex, gotOutcome := PlacementOutcome(c.index, c.placement, c.poolSize)
		if gotIndex != c.wantIndex || gotOutcome != c.wantOutcome {
			t.Errorf("%s: PlacementOutcome(%d,%d,%d) = (%d,%q), want (%d,%q)",
				c.name, c.index, c.placement, c.poolSize, gotIndex, gotOutcome, c.wantIndex, c.wantOutcome)
		}
	}
}

// TestWeekAndMonthKeys pins the UTC calendar keys and their ordering.
func TestWeekAndMonthKeys(t *testing.T) {
	re := regexp.MustCompile(`^\d{4}-W\d{2}$`)
	sat := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC) // Saturday
	if got := WeekKey(sat); !re.MatchString(got) {
		t.Fatalf("WeekKey = %q, not an ISO week key", got)
	}
	if got := WeekKey(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)); got != "2026-W01" {
		t.Errorf("WeekKey(2026-01-01) = %q, want 2026-W01", got)
	}
	// ISO weeks run Mon-Sun: Saturday and the next Sunday share a key; Monday
	// starts a new one.
	if WeekKey(sat) != WeekKey(sat.AddDate(0, 0, 1)) {
		t.Error("Saturday and Sunday must share an ISO week")
	}
	if WeekKey(sat) == WeekKey(sat.AddDate(0, 0, 2)) {
		t.Error("Monday must start a new ISO week")
	}
	if got := PreviousWeekKey(sat.AddDate(0, 0, 7)); got != WeekKey(sat) {
		t.Errorf("PreviousWeekKey(+1w) = %q, want %q", got, WeekKey(sat))
	}
	if got := MonthKey(sat); got != "2026-10" {
		t.Errorf("MonthKey = %q, want 2026-10", got)
	}
	if got := PreviousMonthKey(sat); got != "2026-09" {
		t.Errorf("PreviousMonthKey = %q, want 2026-09", got)
	}
	if got := PreviousMonthKey(time.Date(2026, 1, 5, 0, 0, 0, 0, time.UTC)); got != "2025-12" {
		t.Errorf("year-boundary PreviousMonthKey = %q, want 2025-12", got)
	}
}
