package performance

import (
	"math"
	"testing"
)

func TestExpectedScore(t *testing.T) {
	cal := map[string]any{}
	if got := ExpectedScore(0, cal); math.Abs(got-0.4) > 1e-9 {
		t.Errorf("level 0 = %v", got)
	}
	if got := ExpectedScore(20, cal); math.Abs(got-0.7) > 1e-9 {
		t.Errorf("level 20 = %v", got)
	}
	if got := ExpectedScore(99, cal); math.Abs(got-0.7) > 1e-9 {
		t.Errorf("clamped = %v", got)
	}
	custom := map[string]any{"LevelTargets": []any{float64(0.1), float64(0.9)}}
	if got := ExpectedScore(1, custom); got != 0.9 {
		t.Errorf("custom = %v", got)
	}
}

func TestPositionScore(t *testing.T) {
	cases := []struct {
		pos, entrants int
		ranked        bool
		want          float64
	}{
		{1, 10, true, 1}, {10, 10, true, 0}, {5, 10, true, 0.556}, {3, 1, true, 1}, {1, 10, false, 0},
	}
	for _, c := range cases {
		if got := PositionScore(c.pos, c.entrants, c.ranked); math.Abs(got-c.want) > 1e-9 {
			t.Errorf("positionScore(%d,%d,%v) = %v, want %v", c.pos, c.entrants, c.ranked, got, c.want)
		}
	}
}

func TestKnockoutScore(t *testing.T) {
	two := 2
	if got := KnockoutScore(nil, 4); got != 1 {
		t.Errorf("winner = %v", got)
	}
	if got := KnockoutScore(&two, 4); got != 0.25 {
		t.Errorf("lost round 2/4 = %v", got)
	}
	if got := KnockoutScore(&two, 0); got != 0 {
		t.Errorf("no rounds = %v", got)
	}
}

func TestLevelForXpCurve(t *testing.T) {
	th := []any{float64(0), float64(100), float64(400)}
	if got := LevelForXp(0, th); got != 0 {
		t.Errorf("0 xp = %d", got)
	}
	if got := LevelForXp(100, th); got != 1 {
		t.Errorf("100 xp = %d", got)
	}
	if got := LevelForXp(900, th); got != 3 {
		t.Errorf("curve fallback = %d", got)
	}
}

func TestDefaultLevelTargets(t *testing.T) {
	targets := DefaultLevelTargets()
	if len(targets) != 21 || targets[0] != 0.4 || targets[20] != 0.7 {
		t.Errorf("targets = %v", targets)
	}
}
