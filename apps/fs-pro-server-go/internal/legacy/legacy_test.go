package legacy

import (
	"reflect"
	"testing"

	"fs-pro-server/internal/campus"
)

// fullStars returns a star map satisfying every chain step.
func fullStars() map[string]int {
	out := make(map[string]int, len(Chain))
	for _, s := range Chain {
		out[s.ID] = s.Stars
	}
	return out
}

func TestChainIsWellFormed(t *testing.T) {
	if len(Chain) < 6 || len(Chain) > 8 {
		t.Fatalf("chain length = %d, want 6-8 long-horizon steps", len(Chain))
	}
	seen := map[string]bool{}
	for _, s := range Chain {
		if seen[s.ID] {
			t.Errorf("duplicate step id %q", s.ID)
		}
		seen[s.ID] = true
		if s.ID == "" {
			t.Error("step id must not be empty")
		}
		if s.Stars < 1 || s.Stars > 3 {
			t.Errorf("step %q stars = %d, want 1-3", s.ID, s.Stars)
		}
	}
}

func TestCompleteAndGranted(t *testing.T) {
	cases := []struct {
		name     string
		stars    map[string]int
		complete bool
		granted  int
	}{
		{"nil is incomplete", nil, false, 0},
		{"empty is incomplete", map[string]int{}, false, 0},
		{"one missing step blocks the chain", func() map[string]int {
			s := fullStars()
			delete(s, "club-legend")
			return s
		}(), false, 0},
		{"one short on a step blocks the chain", func() map[string]int {
			s := fullStars()
			s["fortress-home"] = 2 // needs 3
			return s
		}(), false, 0},
		{"over-earning every step completes", func() map[string]int {
			s := fullStars()
			for id := range s {
				s[id] += 10
			}
			return s
		}(), true, 1},
		{"exactly met completes", fullStars(), true, 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Complete(tc.stars); got != tc.complete {
				t.Errorf("Complete = %v, want %v", got, tc.complete)
			}
			if got := Granted(tc.stars); got != tc.granted {
				t.Errorf("Granted = %d, want %d", got, tc.granted)
			}
		})
	}
}

func TestRemainingOrdering(t *testing.T) {
	// Meet only the first two steps: the rest must come back in chain order.
	stars := map[string]int{
		"first-grounds":      1,
		"first-raid-win":     1,
		"clean-sheet-streak": 1, // needs 2 -> still remaining
	}
	got := Remaining(stars)
	want := Chain[2:] // everything from clean-sheet-streak on
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Remaining = %+v, want %+v", got, want)
	}

	// Empty input leaves the whole chain, in order.
	if got := Remaining(nil); !reflect.DeepEqual(got, Chain) {
		t.Fatalf("Remaining(nil) = %+v, want the full chain", got)
	}

	// A complete chain has nothing left to do.
	if got := Remaining(fullStars()); len(got) != 0 {
		t.Fatalf("Remaining(complete) = %+v, want empty", got)
	}
}

func TestTotalStarsCap(t *testing.T) {
	if got := TotalStars(nil); got != 0 {
		t.Errorf("TotalStars(nil) = %d, want 0", got)
	}
	if got := TotalStars(fullStars()); got != MaxStars() {
		t.Errorf("TotalStars(complete) = %d, want MaxStars %d", got, MaxStars())
	}
	// Over-earning is capped per step, so the total cannot exceed the chain max.
	over := fullStars()
	for id := range over {
		over[id] = 1000
	}
	if got := TotalStars(over); got != MaxStars() {
		t.Errorf("TotalStars(over) = %d, want the cap %d", got, MaxStars())
	}
	// Partial credit counts toward the total.
	partial := map[string]int{"first-grounds": 1, "clean-sheet-streak": 1, "club-legend": 99}
	want := 1 + 1 + 3 // club-legend capped at its requirement
	if got := TotalStars(partial); got != want {
		t.Errorf("TotalStars(partial) = %d, want %d", got, want)
	}
	// Negative stars must never reduce the total below zero.
	if got := TotalStars(map[string]int{"first-grounds": -5}); got != 0 {
		t.Errorf("negative stars = %d, want 0", got)
	}
}

// TestSixthGroundskeeperLinkage proves the chain's reward really is the *6th*
// Groundskeeper: campus caps groundskeepers at 6, milestones grant the first 3,
// and the chain contributes exactly the one remaining slot on completion.
func TestSixthGroundskeeperLinkage(t *testing.T) {
	if campus.MaxGroundskeepers != 6 {
		t.Fatalf("campus.MaxGroundskeepers = %d, want 6", campus.MaxGroundskeepers)
	}
	if got := campus.GroundskeepersForTier(campus.MilestoneGroundskeepers); got != 3 {
		t.Fatalf("milestones grant %d groundskeepers, want 3", got)
	}
	if got := Granted(fullStars()); got != 1 {
		t.Fatalf("a complete chain grants %d groundskeeper(s), want 1 (the 6th)", got)
	}
	// The chain is the only path to the 6th slot: 3 milestone + 2 purchased = 5.
	if campus.MaxGroundskeepers-campus.MilestoneGroundskeepers != 3 {
		t.Errorf("unexpected groundskeepers 4..6 layout: %d - %d != 3",
			campus.MaxGroundskeepers, campus.MilestoneGroundskeepers)
	}
}
