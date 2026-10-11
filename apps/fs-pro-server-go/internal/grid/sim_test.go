package grid

import (
	"encoding/json"
	"testing"
)

func TestSimSlots(t *testing.T) {
	g := validGrid()
	slots := SimSlots(g)
	if len(slots) != Starters {
		t.Fatalf("SimSlots returned %d, want %d", len(slots), Starters)
	}
	if slots[0].X != 0.5/9 || slots[0].Y != 3.5/7 {
		t.Errorf("keeper slot = %+v, want x=0.5/9 y=3.5/7", slots[0])
	}
	xi := StartingXI(g)
	if len(xi) != Starters || xi[0] != "gk" || xi[10] != "a3" {
		t.Errorf("StartingXI = %v, want gk..a3", xi)
	}
	// The wire shape must serialise as lowercase x/y (RawFormationSlot).
	b, err := json.Marshal(slots[0])
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	if m["x"] != 0.5/9 || m["y"] != 0.5 {
		t.Errorf("slot JSON = %s, want keys x,y with the normalized cell centre", b)
	}
	if m["position"] != "GK" {
		t.Errorf("slot JSON must carry position, got %s", b)
	}
	if _, ok := m["X"]; ok {
		t.Errorf("slot JSON must use lowercase x/y, got %s", b)
	}
}

// TestSimSlotsCarriesPosition is the regression guard for a real defect: the
// payload used to omit each slot's `position`, so sim-core's
// `parse_formation_slot` defaulted every anchor to MID. `select_starting_xi`
// then filled the wrong lines and put the goalkeeper outfield (verified by
// running crates/sim-core's `sim_cli` on a payload without `position`). Every
// compiled slot must carry the band its player occupies.
func TestSimSlotsCarriesPosition(t *testing.T) {
	g := validGrid()
	slots := SimSlots(g)
	if len(slots) != len(g.Slots) {
		t.Fatalf("SimSlots returned %d, want %d", len(slots), len(g.Slots))
	}
	for i := range slots {
		if slots[i].Position != g.Slots[i].Position {
			t.Errorf("slot %d position = %q, want %q", i, slots[i].Position, g.Slots[i].Position)
		}
	}

	b, err := json.Marshal(slots)
	if err != nil {
		t.Fatal(err)
	}
	var decoded []struct {
		X        float64 `json:"x"`
		Y        float64 `json:"y"`
		Position string  `json:"position"`
	}
	if err := json.Unmarshal(b, &decoded); err != nil {
		t.Fatalf("payload is not the RawFormationSlot shape: %v\n%s", err, b)
	}
	if decoded[0].Position != "GK" || decoded[8].Position != "ATT" {
		t.Errorf("payload positions = %q/%q, want GK/ATT", decoded[0].Position, decoded[8].Position)
	}
	if decoded[0].X != 0.5/9 || decoded[0].Y != 0.5 {
		t.Errorf("payload anchors moved: %+v", decoded[0])
	}
}
