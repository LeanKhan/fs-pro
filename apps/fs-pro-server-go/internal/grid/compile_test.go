package grid

import (
	"bytes"
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

func TestCompileShapeIsDeterministicAndByteIdentical(t *testing.T) {
	g := validGrid()
	first := CompileShape(g)
	second := CompileShape(g)
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("CompileShape is not deterministic:\n%+v\n%+v", first, second)
	}
	b1, err := json.Marshal(first)
	if err != nil {
		t.Fatal(err)
	}
	b2, err := json.Marshal(second)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(b1, b2) {
		t.Fatalf("CompileShape JSON is not byte-identical:\n%s\n%s", b1, b2)
	}
	if len(first.Slots) != Starters || len(first.StartingXI) != Starters {
		t.Errorf("shape = %d slots / %d XI, want %d/%d", len(first.Slots), len(first.StartingXI), Starters, Starters)
	}
}

// TestCompileShapeGolden pins a fixed grid's full compile output (slots + XI +
// preview) so an accidental change to anchors, auras, links, directness or
// synergies is caught. Regenerate with `go run` (see PROGRESS.md) only when the
// change is intended.
func TestCompileShapeGolden(t *testing.T) {
	want, err := os.ReadFile("testdata/compiled_shape.golden")
	if err != nil {
		t.Fatalf("read golden: %v", err)
	}
	got, err := json.MarshalIndent(CompileShape(validGrid()), "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	got = append(got, '\n')
	if !bytes.Equal(got, want) {
		t.Fatalf("CompiledShape drifted from the golden.\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

// TestCompileShapeIsTotal sweeps degenerate and adversarial grids: the compiler
// must never panic and must always return a well-formed shape.
func TestCompileShapeIsTotal(t *testing.T) {
	cases := []Grid{
		{},
		{Slots: nil},
		{Slots: []Slot{}},
		{Slots: []Slot{{Col: 0, Row: 3, PlayerID: "gk", Position: GK}}},
		{Slots: []Slot{{Col: 99, Row: -4, PlayerID: "x", Position: ATT}}},
		validGrid(),
		func() Grid { // duplicates + wrong keeper count
			g := validGrid()
			g.Slots[1] = g.Slots[2]
			return g
		}(),
		func() Grid { // 12 slots
			g := validGrid()
			g.Slots = append(g.Slots, Slot{Col: 8, Row: 6, PlayerID: "extra", Position: ATT})
			return g
		}(),
	}
	for i, g := range cases {
		shape := CompileShape(g) // must not panic
		if len(shape.Preview.Aura) != Width*Height {
			t.Errorf("case %d: aura length = %d, want %d", i, len(shape.Preview.Aura), Width*Height)
		}
		if shape.Preview.Directness < 0.3 || shape.Preview.Directness > 1.0 {
			t.Errorf("case %d: directness = %v, want within [0.3, 1]", i, shape.Preview.Directness)
		}
		if len(shape.Slots) != len(g.Slots) || len(shape.StartingXI) != len(g.Slots) {
			t.Errorf("case %d: shape lengths = %d/%d, want %d", i, len(shape.Slots), len(shape.StartingXI), len(g.Slots))
		}
	}
}
