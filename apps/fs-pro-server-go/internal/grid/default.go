package grid

import "sort"

// SquadPlayer is what DefaultGrid needs to know about a player.
type SquadPlayer struct {
	ID       string
	Position Position
	Rating   float64
}

// defaultCells is a 4-3-3 that fits the tier-1 columns (X0..X4): keeper in the
// goal zone, a back four, a midfield three, and the front three in X4.
var defaultCells = map[Position][][2]int{
	GK:  {{0, 3}},
	DEF: {{1, 1}, {1, 2}, {1, 4}, {1, 5}},
	MID: {{3, 1}, {3, 3}, {3, 5}},
	ATT: {{4, 1}, {4, 3}, {4, 5}},
}

// DefaultGrid lays out a starter XI as a 4-3-3: the best-rated players of each
// position fill its cells, and any line short of players is filled by the best
// remaining outfielders. ok is false when the squad has no keeper or fewer than
// eleven players. The result is valid at Clubhouse tier 1.
func DefaultGrid(squad []SquadPlayer) (Grid, bool) {
	sorted := append([]SquadPlayer(nil), squad...)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].Rating > sorted[j].Rating })
	used := map[string]bool{}
	take := func(pos Position, outfieldOnly bool) (SquadPlayer, bool) {
		for _, p := range sorted {
			if used[p.ID] || (pos != "" && p.Position != pos) || (outfieldOnly && p.Position == GK) {
				continue
			}
			used[p.ID] = true
			return p, true
		}
		return SquadPlayer{}, false
	}
	g := Grid{}
	for _, pos := range []Position{GK, DEF, MID, ATT} {
		for _, cell := range defaultCells[pos] {
			p, ok := take(pos, false)
			if !ok && pos != GK {
				p, ok = take("", true)
			}
			if !ok {
				return Grid{}, false
			}
			slotPos := p.Position
			if pos == GK {
				slotPos = GK
			}
			g.Slots = append(g.Slots, Slot{Col: cell[0], Row: cell[1], PlayerID: p.ID, Position: slotPos})
		}
	}
	return g, Validate(g, 1) == ""
}
