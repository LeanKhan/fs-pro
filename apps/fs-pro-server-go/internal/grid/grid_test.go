package grid

import (
	"encoding/json"
	"testing"
)

// validGrid is a legal 9x7 layout whose highest column is X4, so it is legal at
// Clubhouse tier 1.
func validGrid() Grid {
	return Grid{Slots: []Slot{
		{Col: 0, Row: 3, PlayerID: "gk", Position: GK},
		{Col: 1, Row: 1, PlayerID: "d1", Position: DEF},
		{Col: 1, Row: 3, PlayerID: "d2", Position: DEF},
		{Col: 1, Row: 5, PlayerID: "d3", Position: DEF},
		{Col: 3, Row: 0, PlayerID: "m1", Position: MID},
		{Col: 3, Row: 2, PlayerID: "m2", Position: MID},
		{Col: 3, Row: 4, PlayerID: "m3", Position: MID},
		{Col: 3, Row: 6, PlayerID: "m4", Position: MID},
		{Col: 4, Row: 1, PlayerID: "a1", Position: ATT},
		{Col: 4, Row: 3, PlayerID: "a2", Position: ATT},
		{Col: 4, Row: 5, PlayerID: "a3", Position: ATT},
	}}
}

func TestMaxColumnForTier(t *testing.T) {
	cases := map[int]int{0: 4, 1: 4, 2: 5, 3: 6, 4: 7, 5: 8, 9: 8}
	for tier, want := range cases {
		if got := MaxColumnForTier(tier); got != want {
			t.Errorf("MaxColumnForTier(%d) = %d, want %d", tier, got, want)
		}
	}
}

func TestPositionForColumn(t *testing.T) {
	cases := map[int]Position{0: GK, 1: DEF, 2: DEF, 3: MID, 5: MID, 6: ATT, 8: ATT}
	for col, want := range cases {
		if got := PositionForColumn(col); got != want {
			t.Errorf("PositionForColumn(%d) = %s, want %s", col, got, want)
		}
	}
}

func TestCellToNorm(t *testing.T) {
	if x, y := CellToNorm(0, 0); x != 0.5/9 || y != 0.5/7 {
		t.Errorf("CellToNorm(0,0) = (%v,%v), want (%v,%v)", x, y, 0.5/9, 0.5/7)
	}
	if x, y := CellToNorm(8, 6); x != 8.5/9 || y != 6.5/7 {
		t.Errorf("CellToNorm(8,6) = (%v,%v), want (%v,%v)", x, y, 8.5/9, 6.5/7)
	}
}

func TestValidateAcceptsValidGrid(t *testing.T) {
	if problem := Validate(validGrid(), 1); problem != "" {
		t.Fatalf("valid grid rejected: %s", problem)
	}
}

func TestValidateTierGate(t *testing.T) {
	g := validGrid()
	g.Slots[8].Col = 5 // X5 is locked until tier 2
	if problem := Validate(g, 1); problem != "That column is locked until your Clubhouse reaches a higher tier" {
		t.Fatalf("locked column not reported, got: %q", problem)
	}
	if problem := Validate(g, 2); problem != "" {
		t.Fatalf("X5 should be legal at tier 2, got: %q", problem)
	}
}

func TestValidateRejectsCount(t *testing.T) {
	g := validGrid()
	g.Slots = g.Slots[:10]
	if problem := Validate(g, 1); problem == "" {
		t.Fatal("a 10-player grid must be rejected")
	}
}

func TestValidateRejectsOverlap(t *testing.T) {
	g := validGrid()
	g.Slots[1].Col, g.Slots[1].Row = g.Slots[2].Col, g.Slots[2].Row
	if problem := Validate(g, 1); problem != "Two players cannot stand in the same cell" {
		t.Fatalf("overlap not reported, got: %q", problem)
	}
}

func TestValidateRejectsOffPitch(t *testing.T) {
	g := validGrid()
	g.Slots[8].Row = 7
	if problem := Validate(g, 1); problem != "A player is off the pitch" {
		t.Fatalf("off-pitch slot not reported, got: %q", problem)
	}
}

func TestValidateRejectsKeeperOutOfZone(t *testing.T) {
	g := validGrid()
	g.Slots[0].Col = 2
	if problem := Validate(g, 3); problem != "The goalkeeper must stand in the goal zone (column X0)" {
		t.Fatalf("keeper out of zone not reported, got: %q", problem)
	}
}

func TestValidateRejectsTwoKeepers(t *testing.T) {
	g := validGrid()
	// A second keeper, also in the goal zone, so the *count* rule is what fires.
	g.Slots[1].Col, g.Slots[1].Row, g.Slots[1].Position = 0, 5, GK
	if problem := Validate(g, 1); problem != "A grid needs exactly one goalkeeper" {
		t.Fatalf("extra keeper not reported, got: %q", problem)
	}
}

func TestValidateRejectsOutfieldInGoalZone(t *testing.T) {
	g := validGrid()
	g.Slots[1].Col = 0
	if problem := Validate(g, 1); problem != "Only the goalkeeper may stand in the goal zone" {
		t.Fatalf("outfielder in goal zone not reported, got: %q", problem)
	}
}

func TestCompileIsDeterministic(t *testing.T) {
	g := validGrid()
	first := Compile(g)
	second := Compile(g)
	if len(first) != Starters || len(second) != Starters {
		t.Fatalf("Compile returned %d/%d anchors, want %d", len(first), len(second), Starters)
	}
	for i := range first {
		if first[i] != second[i] {
			t.Fatalf("Compile is not deterministic at %d: %+v vs %+v", i, first[i], second[i])
		}
	}
	// Golden: the keeper sits centrally in the goal zone.
	if a := first[0]; a.PlayerID != "gk" || a.Position != GK || a.X != 0.5/9 || a.Y != 3.5/7 {
		t.Fatalf("golden keeper anchor mismatch: %+v", a)
	}
}

// TestGridJSONMatchesContract pins the persisted/mirrored JSON of a Grid to the
// shared TypeScript contract (@repo/api-contract/src/grid.ts). PitchGrid is
// `{ slots: GridSlot[] }` and GridSlot is `{ col, row, playerId, position }`
// (all lowercase), so this golden string stops Go and TS drifting apart.
func TestGridJSONMatchesContract(t *testing.T) {
	g := Grid{Slots: []Slot{
		{Col: 0, Row: 3, PlayerID: "gk", Position: GK},
		{Col: 4, Row: 2, PlayerID: "p1", Position: ATT},
	}}
	b, err := json.Marshal(g)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	const want = `{"slots":[{"col":0,"row":3,"playerId":"gk","position":"GK"},{"col":4,"row":2,"playerId":"p1","position":"ATT"}]}`
	if string(b) != want {
		t.Fatalf("grid JSON = %s\nwant (api-contract PitchGrid) = %s", b, want)
	}
}
