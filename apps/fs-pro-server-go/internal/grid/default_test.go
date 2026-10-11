package grid

import (
	"fmt"
	"testing"
)

func starterSquad() []SquadPlayer {
	var out []SquadPlayer
	add := func(pos Position, n int) {
		for i := 0; i < n; i++ {
			out = append(out, SquadPlayer{ID: fmt.Sprintf("%s%d", pos, i), Position: pos, Rating: float64(40 + i)})
		}
	}
	add(GK, 2)
	add(DEF, 5)
	add(MID, 5)
	add(ATT, 4)
	return out
}

func TestDefaultGridIsValidAtTierOne(t *testing.T) {
	g, ok := DefaultGrid(starterSquad())
	if !ok {
		t.Fatal("a 16-player starter squad must give a valid grid")
	}
	if why := Validate(g, 1); why != "" {
		t.Fatalf("invalid: %s", why)
	}
	// The better keeper starts.
	if g.Slots[0].PlayerID != "GK1" {
		t.Errorf("keeper = %s, want the best-rated GK1", g.Slots[0].PlayerID)
	}
}

func TestDefaultGridBorrowsOutfieldersForAShortLine(t *testing.T) {
	squad := []SquadPlayer{{ID: "k", Position: GK, Rating: 50}}
	for i := 0; i < 10; i++ {
		squad = append(squad, SquadPlayer{ID: fmt.Sprintf("m%d", i), Position: MID, Rating: 40})
	}
	if _, ok := DefaultGrid(squad); !ok {
		t.Fatal("ten midfielders and a keeper should still fill the XI")
	}
	if _, ok := DefaultGrid(squad[1:]); ok {
		t.Fatal("no keeper: no grid")
	}
}
