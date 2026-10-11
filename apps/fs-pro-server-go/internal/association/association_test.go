package association

import (
	"testing"
	"time"
)

func TestDerbyResult(t *testing.T) {
	cases := []struct {
		hs, as, hd, ad int
		want           Result
	}{
		{10, 8, 50, 90, Home}, // more stars wins regardless of destruction
		{8, 10, 90, 50, Away},
		{10, 10, 60, 55, Home}, // equal stars -> greater destruction
		{10, 10, 55, 60, Away},
		{10, 10, 60, 60, Draw},
	}
	for _, c := range cases {
		if got := DerbyResult(c.hs, c.as, c.hd, c.ad); got != c.want {
			t.Errorf("DerbyResult(%d,%d,%d,%d) = %d, want %d", c.hs, c.as, c.hd, c.ad, got, c.want)
		}
	}
}

func TestLoansAndPerks(t *testing.T) {
	if got := LoanSlots(1); got != 3 {
		t.Errorf("LoanSlots(1) = %d, want 3", got)
	}
	if got := LoanSlots(3); got != 5 {
		t.Errorf("LoanSlots(3) = %d, want 5", got)
	}
	if got := LoanSlots(0); got != 3 {
		t.Errorf("LoanSlots(0) should floor at level 1, got %d", got)
	}
	if p := PerksForLevel(2); p.VaultBonusPct != 10 || p.IncomeBonusPct != 4 {
		t.Errorf("PerksForLevel(2) = %+v, want {10,4}", p)
	}
}

func TestFestivalWindow(t *testing.T) {
	// 2026-10-10 is a Saturday, so: Fri 9th, Sat 10th, Sun 11th, Mon 12th.
	at := func(day, hour, min int) time.Time {
		return time.Date(2026, time.October, day, hour, min, 0, 0, time.UTC)
	}
	cases := []struct {
		when time.Time
		want bool
	}{
		{at(9, 6, 59), false}, // Friday before 07:00
		{at(9, 7, 0), true},   // Friday 07:00 inclusive
		{at(10, 12, 0), true}, // Saturday
		{at(11, 23, 0), true}, // Sunday
		{at(12, 6, 59), true}, // Monday before 07:00
		{at(12, 7, 0), false}, // Monday 07:00 exclusive
		{at(13, 12, 0), false},
	}
	for _, c := range cases {
		if got := FestivalActive(c.when); got != c.want {
			t.Errorf("FestivalActive(%s) = %v, want %v", c.when.Format(time.RFC3339), got, c.want)
		}
	}
}

// TestFestivalWindowExactDuration pins the window as exactly Fri 07:00 UTC
// (inclusive) to Mon 07:00 UTC (exclusive): 72h, with the final nanosecond open.
func TestFestivalWindowExactDuration(t *testing.T) {
	open := time.Date(2026, time.October, 9, 7, 0, 0, 0, time.UTC)   // Friday
	close := time.Date(2026, time.October, 12, 7, 0, 0, 0, time.UTC) // Monday
	if close.Sub(open) != 72*time.Hour {
		t.Fatalf("window duration = %s, want 72h", close.Sub(open))
	}
	if !FestivalActive(open) {
		t.Error("the window must include its opening instant (Fri 07:00 UTC)")
	}
	if FestivalActive(close) {
		t.Error("the window must exclude its closing instant (Mon 07:00 UTC)")
	}
	if !FestivalActive(close.Add(-time.Nanosecond)) {
		t.Error("the window must still be open just before Mon 07:00 UTC")
	}
}

// TestFestivalActiveTimezoneAgnostic proves the window is evaluated in UTC, not
// in the caller's zone: the same instant expressed in any offset gives the same
// answer (DST-irrelevant because UTC has none).
func TestFestivalActiveTimezoneAgnostic(t *testing.T) {
	zones := []*time.Location{
		time.UTC,
		time.FixedZone("UTC-11", -11*3600),
		time.FixedZone("UTC+13", 13*3600),
	}
	instants := []time.Time{
		time.Date(2026, time.October, 9, 6, 59, 59, 0, time.UTC),  // Fri before open
		time.Date(2026, time.October, 9, 7, 0, 0, 0, time.UTC),    // Fri open (inclusive)
		time.Date(2026, time.October, 10, 12, 0, 0, 0, time.UTC),  // Sat
		time.Date(2026, time.October, 11, 23, 59, 0, 0, time.UTC), // Sun
		time.Date(2026, time.October, 12, 6, 59, 59, 0, time.UTC), // Mon before close
		time.Date(2026, time.October, 12, 7, 0, 0, 0, time.UTC),   // Mon close (exclusive)
		time.Date(2026, time.October, 13, 12, 0, 0, 0, time.UTC),  // Tue
	}
	for _, instant := range instants {
		want := FestivalActive(instant)
		for _, z := range zones {
			if got := FestivalActive(instant.In(z)); got != want {
				t.Errorf("FestivalActive(%s in %s) = %v, want %v",
					instant.Format(time.RFC3339), z, got, want)
			}
		}
	}
}
