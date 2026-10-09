package club

import (
	"math"
	"testing"
)

func TestFitNaturalAndOutOfPosition(t *testing.T) {
	p := advisorPlayer{id: "1", position: "MID", rating: 80, fitness: 100, attrs: map[string]any{}}
	if got := fit(p, LineupSlot{Label: "CM", Pos: "MID"}, "balanced"); math.Abs(got-80) > 1e-9 {
		t.Errorf("natural = %v", got)
	}
	// A keeper in midfield takes the GK mismatch penalty.
	gk := advisorPlayer{id: "2", position: "GK", rating: 80, fitness: 100, attrs: map[string]any{}}
	if got := fit(gk, LineupSlot{Label: "CM", Pos: "MID"}, "balanced"); math.Abs(got-0) > 1e-9 {
		t.Errorf("gk oop = %v", got)
	}
	// Out-of-position DEF>MID costs 12.
	def := advisorPlayer{id: "3", position: "DEF", rating: 80, fitness: 100, attrs: map[string]any{}}
	if got := fit(def, LineupSlot{Label: "CM", Pos: "MID"}, "balanced"); math.Abs(got-(80-12)) > 1e-9 {
		t.Errorf("def>mid = %v", got)
	}
}

func TestAssignFillsEverySlot(t *testing.T) {
	pool := []advisorPlayer{}
	for i := 0; i < 11; i++ {
		pool = append(pool, advisorPlayer{id: string(rune('a' + i)), position: "MID", rating: float64(60 + i), fitness: 100, attrs: map[string]any{}})
	}
	pool[0].position = "GK"
	slots := []LineupSlot{{Label: "GK", Pos: "GK"}}
	for i := 0; i < 10; i++ {
		slots = append(slots, LineupSlot{Label: "M", Pos: "MID"})
	}
	chosen := assign(pool, slots, "balanced")
	for i, p := range chosen {
		if p == nil {
			t.Fatalf("slot %d empty", i)
		}
	}
	if chosen[0].position != "GK" {
		t.Errorf("GK slot got %s", chosen[0].position)
	}
}

func TestPickApproach(t *testing.T) {
	candidates := []lineupCandidate{
		{approach: "balanced", score: 80, outOfPosition: 0},
		{approach: "attacking", score: 82, outOfPosition: 0},
		{approach: "solid", score: 70, outOfPosition: 0},
	}
	got, conf := pickApproach(candidates, "Balanced")
	if got != "attacking" {
		t.Errorf("approach = %q", got)
	}
	if conf <= 0 || conf > 1 {
		t.Errorf("confidence = %v", conf)
	}
	// A heavy out-of-position penalty on the best score flips the pick.
	candidates[1].outOfPosition = 3 // -24
	got, _ = pickApproach(candidates, "Balanced")
	if got != "balanced" {
		t.Errorf("penalised approach = %q", got)
	}
}

func TestPickBenchSize(t *testing.T) {
	pool := []advisorPlayer{}
	for i := 0; i < 20; i++ {
		pos := "MID"
		switch i % 4 {
		case 0:
			pos = "GK"
		case 1:
			pos = "DEF"
		case 2:
			pos = "ATT"
		}
		pool = append(pool, advisorPlayer{id: string(rune('A' + i)), position: pos, rating: float64(50 + i)})
	}
	bench := pickBench(pool, map[string]bool{})
	if len(bench) != benchSize {
		t.Errorf("bench size = %d, want %d", len(bench), benchSize)
	}
}
