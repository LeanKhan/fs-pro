package grid

// SimSlot is the wire shape of one sim-core formation slot (`RawFormationSlot`:
// `{ "x": <normalized>, "y": <normalized> }`). See crates/sim-core/src/contract.rs.
type SimSlot struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// SimSlots compiles a grid to the `tactics.<side>.slots` payload, in slot order.
func SimSlots(g Grid) []SimSlot {
	out := make([]SimSlot, 0, len(g.Slots))
	for _, s := range g.Slots {
		x, y := CellToNorm(s.Col, s.Row)
		out = append(out, SimSlot{X: x, Y: y})
	}
	return out
}

// StartingXI is the ordered list of player ids sim-core honours first
// (`RawClub.lineup.startingXI`).
func StartingXI(g Grid) []string {
	out := make([]string, 0, len(g.Slots))
	for _, s := range g.Slots {
		out = append(out, s.PlayerID)
	}
	return out
}
