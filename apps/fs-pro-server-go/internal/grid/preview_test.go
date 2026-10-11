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
	// DEF ≈ Anchor/Tank (03 §1.4): radius 1 incl. diagonals, own cell 0.8 and
	// each of the 8 neighbours 0.4.
	g := Grid{Slots: []Slot{{Col: 1, Row: 3, PlayerID: "d", Position: DEF}}}
	p := BuildPreview(g)
	if got := p.Aura[3*Width+1]; got != 0.8 {
		t.Errorf("own cell pressure = %v, want 0.8", got)
	}
	if got := p.Aura[3*Width+0]; got != 0.4 {
		t.Errorf("adjacent pressure = %v, want 0.4", got)
	}
	if got := p.Aura[2*Width+0]; got != 0.4 {
		t.Errorf("diagonal pressure = %v, want 0.4", got)
	}
	if got := p.Aura[3*Width+3]; got != 0 {
		t.Errorf("two cells away = %v, want 0", got)
	}
}

// TestPreviewAuraPerBand pins the band-derived aura table (03 §1.4): the slot
// carries only a band, so the band stands in for its canonical role.
func TestPreviewAuraPerBand(t *testing.T) {
	const c, r = 4, 3
	cases := []struct {
		name          string
		pos           Position
		self, adjacen float64
	}{
		{"DEF ≈ Anchor/Tank", DEF, 0.8, 0.4},
		{"MID ≈ engine (weighted higher)", MID, 1.0, 0.5},
		{"ATT ≈ Sniper/Playmaker (soft)", ATT, 0.5, 0},
		{"GK projects none", GK, 0, 0},
	}
	for _, tc := range cases {
		p := BuildPreview(Grid{Slots: []Slot{{Col: c, Row: r, PlayerID: "p", Position: tc.pos}}})
		if got := p.Aura[r*Width+c]; got != tc.self {
			t.Errorf("%s: own cell = %v, want %v", tc.name, got, tc.self)
		}
		// An orthogonal neighbour and a diagonal neighbour must both match.
		if got := p.Aura[r*Width+(c-1)]; got != tc.adjacen {
			t.Errorf("%s: orthogonal neighbour = %v, want %v", tc.name, got, tc.adjacen)
		}
		if got := p.Aura[(r-1)*Width+(c-1)]; got != tc.adjacen {
			t.Errorf("%s: diagonal neighbour = %v, want %v", tc.name, got, tc.adjacen)
		}
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

// TestPreviewIslandBoundary pins the column-based island rule (03 §1.6, OW-P02)
// at its 3-column edge and for a completely lone attacker (never panics, always
// total).
func TestPreviewIslandBoundary(t *testing.T) {
	near := Grid{Slots: []Slot{
		{Col: 6, Row: 3, PlayerID: "a1", Position: ATT},
		{Col: 4, Row: 3, PlayerID: "m1", Position: MID}, // 2 columns away
	}}
	if has(BuildPreview(near).Synergies, "island") {
		t.Error("an attacker with a teammate within 2 columns must not be an island")
	}
	far := Grid{Slots: []Slot{
		{Col: 8, Row: 3, PlayerID: "a1", Position: ATT},
		{Col: 5, Row: 3, PlayerID: "m1", Position: MID}, // 3 columns away
	}}
	if !has(BuildPreview(far).Synergies, "island") {
		t.Error("an attacker 3 columns from every teammate is an island")
	}
	lone := Grid{Slots: []Slot{{Col: 8, Row: 3, PlayerID: "a1", Position: ATT}}}
	if !has(BuildPreview(lone).Synergies, "island") {
		t.Error("a lone attacker with no teammates is an island")
	}
}

// TestPreviewIslandIsColumnsNotChebyshev distinguishes the doc's column rule
// (OW-P02) from the old Chebyshev-cell rule: a teammate in the same column but
// many rows away is NOT far enough, while a teammate 3 columns away provably is.
func TestPreviewIslandIsColumnsNotChebyshev(t *testing.T) {
	// Same column (dx = 0) but Chebyshev 5: the old rule called this an island;
	// the column rule must not.
	sameColumn := Grid{Slots: []Slot{
		{Col: 3, Row: 0, PlayerID: "a1", Position: ATT},
		{Col: 3, Row: 5, PlayerID: "m1", Position: MID},
	}}
	if has(BuildPreview(sameColumn).Synergies, "island") {
		t.Error("a teammate in the same column must block island regardless of row")
	}
	// Three columns away but adjacent rows (Chebyshev 3, largest component dx):
	// provably an island under the column rule.
	threeColumns := Grid{Slots: []Slot{
		{Col: 6, Row: 3, PlayerID: "a1", Position: ATT},
		{Col: 3, Row: 4, PlayerID: "m1", Position: MID},
	}}
	if !has(BuildPreview(threeColumns).Synergies, "island") {
		t.Error("an attacker 3 columns from every teammate is an island")
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
