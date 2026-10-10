package grid

import "testing"

// TestPreviewAuraStacks pins the aura model: overlapping pressure auras add
// (own cell 1.0, each of the 8 neighbours 0.5), so a compact block projects
// more pressure than the same players spread out.
func TestPreviewAuraStacks(t *testing.T) {
	g := Grid{Slots: []Slot{
		{Col: 1, Row: 3, PlayerID: "a", Position: DEF},
		{Col: 1, Row: 4, PlayerID: "b", Position: DEF},
	}}
	p := BuildPreview(g)
	// Cell (1,3): 1.0 from a (own) + 0.5 from b (adjacent) = 1.5.
	if got := p.Aura[3*Width+1]; got != 1.5 {
		t.Errorf("stacked aura = %v, want 1.5", got)
	}
	// Cell (1,4): symmetric.
	if got := p.Aura[4*Width+1]; got != 1.5 {
		t.Errorf("stacked aura = %v, want 1.5", got)
	}
	// The goalkeeper projects no aura.
	withGK := BuildPreview(Grid{Slots: []Slot{{Col: 0, Row: 3, PlayerID: "gk", Position: GK}}})
	for i, v := range withGK.Aura {
		if v != 0 {
			t.Fatalf("keeper projected aura at %d: %v", i, v)
		}
	}
}

func TestThreatReadOfValidGrid(t *testing.T) {
	tr := ThreatReadOf(validGrid())
	if len(tr.Occupancy) != Width {
		t.Fatalf("occupancy length = %d, want %d", len(tr.Occupancy), Width)
	}
	// validGrid: 3 left, 4 centre, 3 right outfielders.
	if tr.Lanes[0].Name != "centre" || tr.Lanes[0].Players != 4 {
		t.Errorf("strongest lane = %+v, want centre/4", tr.Lanes[0])
	}
	if tr.Lanes[1].Name != "left" || tr.Lanes[2].Name != "right" {
		t.Errorf("tie break = %v/%v, want left then right", tr.Lanes[1].Name, tr.Lanes[2].Name)
	}
	if tr.Attacking != 0 {
		t.Errorf("attacking = %d, want 0 (no one past X5)", tr.Attacking)
	}
	if !tr.HighLine {
		t.Error("validGrid's deepest outfielder is at X4, so HighLine should be true")
	}
	for i, n := range tr.Occupancy {
		if i == 0 && n != 0 {
			t.Errorf("occupancy[0] = %d, want 0 (keeper is not outfield)", n)
		}
	}
}

func TestThreatReadOfEmptyIsTotal(t *testing.T) {
	tr := ThreatReadOf(Grid{})
	if len(tr.Lanes) != 3 || len(tr.Occupancy) != Width {
		t.Fatalf("empty read not well-formed: %+v", tr)
	}
	for _, l := range tr.Lanes {
		if l.Players != 0 || l.Share != 0 {
			t.Errorf("empty lane %+v, want zero", l)
		}
	}
	if tr.Attacking != 0 || tr.HighLine {
		t.Errorf("empty grid attacking=%d highLine=%v, want 0/false", tr.Attacking, tr.HighLine)
	}
}

func TestThreatReadSharesSum(t *testing.T) {
	tr := ThreatReadOf(validGrid())
	sum := 0.0
	for _, l := range tr.Lanes {
		sum += l.Share
	}
	if sum < 0.999 || sum > 1.001 {
		t.Errorf("lane shares sum to %v, want 1.0", sum)
	}
}
