package grid

// SimSlot is the wire shape of one sim-core formation slot (`RawFormationSlot`:
// `{ "x": <normalized>, "y": <normalized>, "position": <GK|DEF|MID|ATT> }`). See
// crates/sim-core/src/contract.rs.
//
// `position` is not optional in practice: sim-core's `parse_formation_slot`
// defaults a missing position to MID, and `select_starting_xi` uses each slot's
// position to decide which line need it fills and which player stands there. A
// payload without it puts the goalkeeper outfield and scrambles the XI (verified
// with crates/sim-core's `sim_cli`), so every compiled slot must carry its band.
type SimSlot struct {
	X        float64  `json:"x"`
	Y        float64  `json:"y"`
	Position Position `json:"position"`
}

// SimSlots compiles a grid to the `tactics.<side>.slots` payload, in slot order.
func SimSlots(g Grid) []SimSlot {
	out := make([]SimSlot, 0, len(g.Slots))
	for _, s := range g.Slots {
		x, y := CellToNorm(s.Col, s.Row)
		out = append(out, SimSlot{X: x, Y: y, Position: s.Position})
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
