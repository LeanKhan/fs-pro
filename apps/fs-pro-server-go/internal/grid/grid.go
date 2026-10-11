// Package grid is the Pitch Grid: the spatial lineup canvas (docs/coc-mapping/03,
// "The Pitch Grid"). A club arranges its 11 starters on a 9x7 grid; the grid is a
// *compile step* to the freeform formation anchors sim-core already accepts
// (crates/sim-core: x 0 = own goal line -> 1 = opponent goal line, y 0 = left
// touchline -> 1 = right touchline).
//
// Validity rules live here and are mirrored by @repo/api-contract/src/grid.ts so
// the client preview and the server never disagree; the server is authoritative.
package grid

import "fmt"

const (
	// Width is the number of columns (x, own goal line -> opponent goal line).
	Width = 9
	// Height is the number of rows (y, left touchline -> right touchline).
	Height = 7
	// Starters is the matchday XI size.
	Starters = 11
	// Keepers is the required number of goalkeepers.
	Keepers = 1
	// MaxTier is the highest Clubhouse tier (unlocks every column).
	MaxTier = 5
)

// Position mirrors sim-core's PositionCategory string.
type Position string

// The four pitch bands.
const (
	GK  Position = "GK"
	DEF Position = "DEF"
	MID Position = "MID"
	ATT Position = "ATT"
)

// Slot is one player's cell on the grid. The JSON keys are pinned to the
// shared contract (@repo/api-contract/src/grid.ts, `GridSlot`): lowercase
// `col`/`row`/`playerId`/`position`, so the persisted/mirrored shape matches the
// TypeScript type exactly. Do not rename without updating the golden test.
type Slot struct {
	Col      int      `json:"col"`
	Row      int      `json:"row"`
	PlayerID string   `json:"playerId"`
	Position Position `json:"position"`
}

// Grid is a club's layout: exactly 11 slots, at most one per cell. The JSON key
// is pinned to the shared contract (`PitchGrid` -> `{ slots: ... }`).
type Grid struct {
	Slots []Slot `json:"slots"`
}

// Anchor is a compiled sim-core formation slot in normalized pitch coordinates.
// Its JSON keys are pinned to the shared contract's `GridAnchor`
// (@repo/api-contract/src/grid.ts) exactly as Slot is pinned to GridSlot.
type Anchor struct {
	PlayerID string   `json:"playerId"`
	Position Position `json:"position"`
	X        float64  `json:"x"`
	Y        float64  `json:"y"`
}

// MaxColumnForTier is the highest unlocked column for a Clubhouse tier:
// tier 1 -> X0..X4, tier 2 -> X0..X5, ... tier 5+ -> X0..X8 (03 §1.3).
func MaxColumnForTier(tier int) int {
	if tier < 1 {
		tier = 1
	}
	if tier > MaxTier {
		tier = MaxTier
	}
	return tier + 3 // 4..8
}

// BandOf labels the pitch band a column belongs to.
func BandOf(col int) string {
	switch {
	case col <= 0:
		return "keeper"
	case col <= 2:
		return "defence"
	case col <= 5:
		return "middle"
	default:
		return "attack"
	}
}

// PositionForColumn is the band a cell implies (X0 keeper; X1-2 DEF; X3-5 MID;
// X6-8 ATT). It is a default only - the grid is freeform.
func PositionForColumn(col int) Position {
	switch {
	case col <= 0:
		return GK
	case col <= 2:
		return DEF
	case col <= 5:
		return MID
	default:
		return ATT
	}
}

// CellToNorm converts a cell to the normalized centre sim-core uses.
func CellToNorm(col, row int) (x, y float64) {
	return (float64(col) + 0.5) / float64(Width), (float64(row) + 0.5) / float64(Height)
}

// Validate returns "" when the grid is legal for a Clubhouse tier, otherwise why
// not. The reason strings are identical to @repo/api-contract/src/grid.ts.
func Validate(g Grid, clubhouseTier int) string {
	if len(g.Slots) != Starters {
		return fmt.Sprintf("A grid needs exactly %d players - you have %d", Starters, len(g.Slots))
	}
	maxCol := MaxColumnForTier(clubhouseTier)
	taken := map[[2]int]bool{}
	keepers := 0
	for _, s := range g.Slots {
		if s.Col < 0 || s.Col >= Width || s.Row < 0 || s.Row >= Height {
			return "A player is off the pitch"
		}
		if s.Col > maxCol {
			return "That column is locked until your Clubhouse reaches a higher tier"
		}
		cell := [2]int{s.Col, s.Row}
		if taken[cell] {
			return "Two players cannot stand in the same cell"
		}
		taken[cell] = true
		if s.Position == GK {
			keepers++
			if s.Col != 0 {
				return "The goalkeeper must stand in the goal zone (column X0)"
			}
		} else if s.Col == 0 {
			return "Only the goalkeeper may stand in the goal zone"
		}
	}
	if keepers != Keepers {
		return "A grid needs exactly one goalkeeper"
	}
	return ""
}

// Compile turns a grid into the XI's sim-core anchors, in slot order. It is pure
// and deterministic: the same grid always yields the same anchors.
func Compile(g Grid) []Anchor {
	out := make([]Anchor, 0, len(g.Slots))
	for _, s := range g.Slots {
		x, y := CellToNorm(s.Col, s.Row)
		out = append(out, Anchor{PlayerID: s.PlayerID, Position: s.Position, X: x, Y: y})
	}
	return out
}
