package facilities

import "fmt"

// Campus grid + placement validation, ported from campus-grid.ts.

// CampusGrid bounds.
var CampusGrid = struct{ MinX, MaxX, MinZ, MaxZ int }{-14, 13, -12, 11}

// CampusBuildings maps a building key to its [width, depth] footprint.
var CampusBuildings = map[string][2]int{
	"stadium_grounds": {7, 5},
	"stands":          {5, 2},
	"training_ground": {4, 3},
	"youth_academy":   {3, 3},
	"scouting":        {2, 2},
	"medical_centre":  {3, 2},
	"staff_house":     {3, 2},
	"dugout":          {2, 1},
	"office":          {3, 3},
}

// CampusBuildingKeys is the fixed validation order.
var CampusBuildingKeys = []string{
	"office", "stadium_grounds", "stands", "dugout", "training_ground",
	"youth_academy", "medical_centre", "staff_house", "scouting",
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
	"stands":          {5, 4, 0},
	"dugout":          {6, -3, 0},
	"training_ground": {4, -9, 0},
	"youth_academy":   {-8, 2, 0},
	"medical_centre":  {-6, -4, 0},
	"staff_house":     {-10, -8, 0},
	"scouting":        {11, -11, 0},
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
