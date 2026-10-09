// Package tiles serves the zoomable world map (D2) per viewport and zoom
// level: world > country > region > city > district > club. No endpoint may
// return the whole world; a tile response is bounded by a payload budget.
//
// Scheme (docs/perfect/WORLD-HIERARCHY-SPEC.md §7.3): an integer quadtree over
// the atlas coordinate space. The base cell is BaseCell atlas units at z0 and
// each level halves it, so a place's cell at level z is
// floor(MapX/cellSize(z)), floor(MapY/cellSize(z)). That gives viewport-native
// requests, stable integer cache keys, and O(levels) invalidation.
package tiles

import (
	"context"
	"errors"
	"fmt"
	"math"
)

// ErrInvalidKey means the requested zoom/coordinates are outside the scheme.
var ErrInvalidKey = errors.New("tiles: invalid tile key")

// BaseCell is the atlas-unit size of a z0 tile. Each level halves it.
const BaseCell = 256.0

// Zoom range per the spec zoom-level table.
const (
	MinZ = 0
	MaxZ = 5
)

// Payload budget caps (§7.4). A tile never silently truncates a promised place:
// exceeding either cap returns the bounded subset with Overflow set.
const (
	TileMaxPlaces = 400
	TileMaxClubs  = 200
)

// Key is one tile in the zoom scheme. Z is the zoom level; X and Y are the
// tile coordinates within it.
type Key struct {
	Z int `json:"z"`
	X int `json:"x"`
	Y int `json:"y"`
}

// Valid reports whether the key is inside the scheme.
func (k Key) Valid() bool {
	return k.Z >= MinZ && k.Z <= MaxZ && k.X >= 0 && k.Y >= 0
}

// String is the stable cache key form "z/x/y".
func (k Key) String() string { return fmt.Sprintf("%d/%d/%d", k.Z, k.X, k.Y) }

// cellSize is the atlas-unit width of a tile at zoom z.
func cellSize(z int) float64 { return BaseCell / math.Pow(2, float64(z)) }

// CellAt returns the tile cell that contains (x, y) at zoom z.
func CellAt(x, y float64, z int) (int, int) {
	size := cellSize(z)
	return int(math.Floor(x / size)), int(math.Floor(y / size))
}

// LevelForZoom maps a zoom level to the Places.Type whose markers it draws.
// z0/z1 both draw countries (world clusters vs. country level); z5 draws the
// individual clubs of a district.
func LevelForZoom(z int) string {
	switch z {
	case 0, 1:
		return "country"
	case 2:
		return "region"
	case 3:
		return "city"
	case 4:
		return "district"
	default: // 5
		return "club"
	}
}

// ClubCapForZoom is the per-place club cap from the zoom-level table (§7.2).
// A zero value means "all clubs of the place" (z5).
func ClubCapForZoom(z int) int {
	switch z {
	case 0:
		return 3
	case 1, 2:
		return 5
	case 3:
		return 8
	case 4:
		return 10
	default:
		return 0
	}
}

// PlaceMarker is one place drawn on a tile, with how many clubs it holds.
type PlaceMarker struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Type  string  `json:"type"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Clubs int     `json:"clubs"`
}

// ClubMarker is one club drawn on a tile (top-K by prominence for the zoom).
type ClubMarker struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Code       string  `json:"code"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	Prominence float64 `json:"prominence"`
	Human      bool    `json:"human"`
}

// Tile is a bounded response. Rev is the TileRevisions counter for the key,
// used as the ETag/revalidation token.
type Tile struct {
	Key       Key           `json:"key"`
	Places    []PlaceMarker `json:"places"`
	Clubs     []ClubMarker  `json:"clubs"`
	ClubCount int           `json:"clubCount"`
	Overflow  bool          `json:"overflow"`
	ZoomHint  bool          `json:"zoomHint"`
	Rev       int64         `json:"rev"`
}

// Builder builds a tile for a viewport at a zoom level.
type Builder interface {
	Build(ctx context.Context, key Key) (Tile, error)
}
