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
