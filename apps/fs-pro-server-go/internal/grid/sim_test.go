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
	var m map[string]float64
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	if m["x"] != 0.5/9 || m["y"] != 0.5 {
		t.Errorf("slot JSON = %s, want keys x,y with the normalized cell centre", b)
	}
	if _, ok := m["X"]; ok {
		t.Errorf("slot JSON must use lowercase x/y, got %s", b)
	}
}
