package facilities

import "fmt"

// Campus grid + placement validation, ported from campus-grid.ts.

// CampusGrid bounds.
var CampusGrid = struct{ MinX, MaxX, MinZ, MaxZ int }{-14, 13, -12, 11}

// CampusBuildings maps a building key to its [width, depth] footprint: the
// seven campus buildings (clubhouse.Buildings; the Office is the Clubhouse,
// the Stadium grounds the Stadium).
var CampusBuildings = map[string][2]int{
	"office":          {3, 3},
	"stadium_grounds": {7, 5},
	"club_shop":       {3, 2},
	"cash_vault":      {2, 2},
	"training_ground": {4, 3},
	"youth_academy":   {3, 3},
	"medical_centre":  {3, 2},
}

// CampusBuildingKeys is the fixed validation order.
var CampusBuildingKeys = []string{
	"office", "stadium_grounds", "club_shop", "cash_vault", "training_ground", "youth_academy", "medical_centre",
}

// Placed is one building's position.
type Placed struct {
	X   int
	Z   int
	Rot int
}

// DefaultPlacement mirrors DEFAULT_PLACEMENT.
var DefaultPlacement = map[string]Placed{
	"office":          {-2, -8, 0},
	"stadium_grounds": {4, -1, 0},
	"club_shop":       {0, 6, 0},
	"cash_vault":      {-4, 6, 0},
	"training_ground": {4, -9, 0},
	"youth_academy":   {-8, 2, 0},
	"medical_centre":  {-7, -4, 0},
}

func footprint(key string, rot int) [2]int {
	f := CampusBuildings[key]
	if rot%2 == 1 {
		return [2]int{f[1], f[0]}
	}
	return f
}

// ValidatePlacement returns "" when the layout is valid, otherwise why not.
func ValidatePlacement(p map[string]Placed) string {
	taken := map[string]bool{}
	for x := 0; x < 2; x++ {
		for z := 0; z < 2; z++ {
			taken[fmt.Sprintf("%d,%d", -1+x, -1+z)] = true
		}
	}
	for _, key := range CampusBuildingKeys {
		at, ok := p[key]
		if !ok {
			return "Missing " + key
		}
		if at.Rot < 0 || at.Rot > 3 {
			return "Bad position for " + key
		}
		f := footprint(key, at.Rot)
		for x := at.X; x < at.X+f[0]; x++ {
			for z := at.Z; z < at.Z+f[1]; z++ {
				cell := fmt.Sprintf("%d,%d", x, z)
				if x < CampusGrid.MinX || x > CampusGrid.MaxX || z < CampusGrid.MinZ || z > CampusGrid.MaxZ {
					return key + " is off the campus"
				}
				if taken[cell] {
					return key + " overlaps another building"
				}
				taken[cell] = true
			}
		}
	}
	return ""
}

// MergePlacement turns a stored CampusPlacement into a complete, valid layout.
// Saved positions are kept; a building the save does not know yet (added
// after the layout was saved) goes to its default spot, or the first free spot
// when that is taken, so adding buildings never resets a player's layout. A
// save that is itself broken falls back to the default layout.
func MergePlacement(saved map[string]Placed) map[string]Placed {
	known := map[string]Placed{}
	for k, v := range saved {
		if _, ok := CampusBuildings[k]; ok {
			known[k] = v
		}
	}
	taken := map[string]bool{}
	for x := 0; x < 2; x++ {
		for z := 0; z < 2; z++ {
			taken[fmt.Sprintf("%d,%d", -1+x, -1+z)] = true
		}
	}
	fits := func(key string, at Placed) bool {
		if at.Rot < 0 || at.Rot > 3 {
			return false
		}
		f := footprint(key, at.Rot)
		for x := at.X; x < at.X+f[0]; x++ {
			for z := at.Z; z < at.Z+f[1]; z++ {
				if x < CampusGrid.MinX || x > CampusGrid.MaxX || z < CampusGrid.MinZ || z > CampusGrid.MaxZ || taken[fmt.Sprintf("%d,%d", x, z)] {
					return false
				}
			}
		}
		return true
	}
	claim := func(key string, at Placed) {
		f := footprint(key, at.Rot)
		for x := at.X; x < at.X+f[0]; x++ {
			for z := at.Z; z < at.Z+f[1]; z++ {
				taken[fmt.Sprintf("%d,%d", x, z)] = true
			}
		}
	}
	out := map[string]Placed{}
	for _, key := range CampusBuildingKeys {
		if at, ok := known[key]; ok {
			if !fits(key, at) {
				return copyPlacement(DefaultPlacement)
			}
			claim(key, at)
			out[key] = at
		}
	}
	for _, key := range CampusBuildingKeys {
		if _, ok := out[key]; ok {
			continue
		}
		at, found := DefaultPlacement[key], false
		if fits(key, at) {
			found = true
		}
		for rot := 0; rot < 2 && !found; rot++ {
			for z := CampusGrid.MinZ; z <= CampusGrid.MaxZ && !found; z++ {
				for x := CampusGrid.MinX; x <= CampusGrid.MaxX && !found; x++ {
					if c := (Placed{X: x, Z: z, Rot: rot}); fits(key, c) {
						at, found = c, true
					}
				}
			}
		}
		if !found {
			return copyPlacement(DefaultPlacement)
		}
		claim(key, at)
		out[key] = at
	}
	return out
}

func copyPlacement(p map[string]Placed) map[string]Placed {
	out := make(map[string]Placed, len(p))
	for k, v := range p {
		out[k] = v
	}
	return out
}

// PlacementFromStored parses a stored CampusPlacement (jsonb) and merges it.
func PlacementFromStored(stored any) map[string]Placed {
	raw, _ := stored.(map[string]any)
	return MergePlacement(parsePlacement(raw))
}
