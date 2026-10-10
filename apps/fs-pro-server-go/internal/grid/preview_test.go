package grid

import "testing"

func has(s []string, want string) bool {
	for _, v := range s {
		if v == want {
			return true
		}
	}
	return false
}

func TestPreviewAuraFalloff(t *testing.T) {
	g := Grid{Slots: []Slot{{Col: 1, Row: 3, PlayerID: "d", Position: DEF}}}
	p := BuildPreview(g)
	if got := p.Aura[3*Width+1]; got != 1.0 {
		t.Errorf("own cell pressure = %v, want 1.0", got)
	}
	if got := p.Aura[3*Width+0]; got != 0.5 {
		t.Errorf("adjacent pressure = %v, want 0.5", got)
	}
	if got := p.Aura[2*Width+0]; got != 0.5 {
		t.Errorf("diagonal pressure = %v, want 0.5", got)
	}
	if got := p.Aura[3*Width+3]; got != 0 {
		t.Errorf("two cells away = %v, want 0", got)
	}
}

func TestPreviewSynergies(t *testing.T) {
	g := Grid{Slots: []Slot{
		{Col: 0, Row: 3, PlayerID: "gk", Position: GK},
		{Col: 3, Row: 3, PlayerID: "m1", Position: MID},
		{Col: 4, Row: 3, PlayerID: "m2", Position: MID},
		{Col: 6, Row: 3, PlayerID: "a1", Position: ATT},
		{Col: 7, Row: 3, PlayerID: "a2", Position: ATT},
	}}
	p := BuildPreview(g)
	if !has(p.Synergies, "the-shield") {
		t.Errorf("adjacent central mids should form the-shield, got %v", p.Synergies)
	}
	if !has(p.Synergies, "one-two-combo") {
		t.Errorf("adjacent attackers should form one-two-combo, got %v", p.Synergies)
	}
}

func TestPreviewIsland(t *testing.T) {
	g := Grid{Slots: []Slot{
		{Col: 0, Row: 3, PlayerID: "gk", Position: GK},
		{Col: 3, Row: 3, PlayerID: "m1", Position: MID},
		{Col: 8, Row: 3, PlayerID: "a1", Position: ATT}, // marooned
	}}
	p := BuildPreview(g)
	if !has(p.Synergies, "island") {
		t.Errorf("a lone attacker should form island, got %v", p.Synergies)
	}
}

// TestPreviewIslandBoundary pins the island rule at its 3-cell edge and for a
// completely lone attacker (never panics, always total).
func TestPreviewIslandBoundary(t *testing.T) {
	near := Grid{Slots: []Slot{
		{Col: 6, Row: 3, PlayerID: "a1", Position: ATT},
		{Col: 4, Row: 3, PlayerID: "m1", Position: MID}, // Chebyshev 2
	}}
	if has(BuildPreview(near).Synergies, "island") {
		t.Error("an attacker with a teammate within 2 cells must not be an island")
	}
	far := Grid{Slots: []Slot{
		{Col: 8, Row: 3, PlayerID: "a1", Position: ATT},
		{Col: 5, Row: 3, PlayerID: "m1", Position: MID}, // Chebyshev 3
	}}
	if !has(BuildPreview(far).Synergies, "island") {
		t.Error("an attacker 3 cells from every teammate is an island")
	}
	lone := Grid{Slots: []Slot{{Col: 8, Row: 3, PlayerID: "a1", Position: ATT}}}
	if !has(BuildPreview(lone).Synergies, "island") {
		t.Error("a lone attacker with no teammates is an island")
	}
}

// TestPreviewEmptyGridIsTotal proves BuildPreview is total for the degenerate
// inputs the compiler must never panic on.
func TestPreviewEmptyGridIsTotal(t *testing.T) {
	p := BuildPreview(Grid{})
	if len(p.Aura) != Width*Height {
		t.Errorf("aura length = %d, want %d", len(p.Aura), Width*Height)
	}
	if p.Connected {
		t.Error("an empty grid must not report Connected")
	}
	if len(p.Links) != 0 || len(p.Synergies) != 0 {
		t.Errorf("empty grid links=%v synergies=%v, want none", p.Links, p.Synergies)
	}
	if p.Directness < 0.3 || p.Directness > 1.0 {
		t.Errorf("empty grid directness = %v, want within [0.3, 1]", p.Directness)
	}
}

func TestPreviewConnected(t *testing.T) {
	p := BuildPreview(validGrid())
	if !p.Connected {
		t.Fatalf("validGrid should be connected, directness=%v", p.Directness)
	}
	if p.Directness != 0.3 {
		t.Errorf("connected grid directness = %v, want 0.3", p.Directness)
	}
}

func TestPreviewDisconnectedRaisesDirectness(t *testing.T) {
	// Defence sits deep, the striker is marooned near the opponent goal: no
	// connector in the middle, so the graph breaks and the side must go long.
	g := Grid{Slots: []Slot{
		{Col: 0, Row: 3, PlayerID: "gk", Position: GK},
		{Col: 1, Row: 3, PlayerID: "d1", Position: DEF},
		{Col: 8, Row: 3, PlayerID: "a1", Position: ATT},
	}}
	p := BuildPreview(g)
	if p.Connected {
		t.Fatal("a broken squad must not report Connected")
	}
	if p.Directness <= 0.3 {
		t.Errorf("broken squad directness = %v, want > 0.3", p.Directness)
	}
}
