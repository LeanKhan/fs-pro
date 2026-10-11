package grid

import (
	"encoding/json"
	"fmt"
)

// LayoutSlot names one of a club's stored layouts (docs/coc-mapping/03 §1.7):
// the Home grid defends the club while offline, the Match grid is the default
// used when attacking, and the Derby grid is used in Association Derbies.
type LayoutSlot string

// The three stored layout slots (the JSON keys of Clubs.Layouts).
const (
	Home  LayoutSlot = "home"
	Match LayoutSlot = "match"
	Derby LayoutSlot = "derby"
)

// slotOrder is the canonical order of the slots (Home, Match, Derby).
var slotOrder = []LayoutSlot{Home, Match, Derby}

// Layouts is a club's layout document: one grid per slot. It is the Go value
// of the Clubs.Layouts JSONB column (docs/coc-mapping/05 §8).
type Layouts map[LayoutSlot]Grid

// ValidSlot reports whether s is a known layout slot.
func ValidSlot(s LayoutSlot) bool {
	switch s {
	case Home, Match, Derby:
		return true
	default:
		return false
	}
}

// Grid returns the grid stored in slot; ok is false when the slot is empty.
func (l Layouts) Grid(slot LayoutSlot) (Grid, bool) {
	g, ok := l[slot]
	return g, ok
}

// Slots lists the populated slots in canonical Home, Match, Derby order. It
// exists because Go map iteration is unordered, so callers that need a stable
// order (a UI, a test, a diff) must not range over the map directly.
func (l Layouts) Slots() []LayoutSlot {
	out := make([]LayoutSlot, 0, len(slotOrder))
	for _, s := range slotOrder {
		if _, ok := l[s]; ok {
			out = append(out, s)
		}
	}
	return out
}

// MarshalJSON encodes the document as a JSON object keyed by slot. An empty or
// nil Layouts encodes as {} rather than null, so the JSONB column always holds
// an object. encoding/json sorts the keys, so the output is deterministic.
func (l Layouts) MarshalJSON() ([]byte, error) {
	if len(l) == 0 {
		return []byte("{}"), nil
	}
	// alias avoids recursing back into this method.
	type alias map[LayoutSlot]Grid
	return json.Marshal(alias(l))
}

// UnmarshalJSON decodes a JSON object into a Layouts document. An unknown slot
// key is refused (rather than silently dropped) so a corrupt or hand-edited
// JSONB value fails loudly; a valid document round-trips exactly.
func (l *Layouts) UnmarshalJSON(data []byte) error {
	var raw map[string]Grid
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	out := make(Layouts, len(raw))
	for key, g := range raw {
		slot := LayoutSlot(key)
		if !ValidSlot(slot) {
			return fmt.Errorf("grid: unknown layout slot %q", key)
		}
		out[slot] = g
	}
	*l = out
	return nil
}

// cloneGrid returns a deep copy of g so a caller cannot mutate stored state
// through the returned Slot slice.
func cloneGrid(g Grid) Grid {
	if g.Slots == nil {
		return Grid{}
	}
	slots := make([]Slot, len(g.Slots))
	copy(slots, g.Slots)
	return Grid{Slots: slots}
}

// cloneLayouts returns a deep copy of l.
func cloneLayouts(l Layouts) Layouts {
	out := make(Layouts, len(l))
	for slot, g := range l {
		out[slot] = cloneGrid(g)
	}
	return out
}
