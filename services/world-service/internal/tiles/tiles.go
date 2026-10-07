// Package tiles serves the zoomable world map (D2) per viewport and zoom
// level: world > country > region > city > district > club. No endpoint may
// return the whole world; a tile response is bounded by a payload budget.
// Batch 3 implements the tile scheme and LOD payloads.
//
// This is the Batch 1 skeleton: the tile key, the bounded payload shape and an
// ErrNotImplemented seam.
package tiles

import (
	"context"
	"errors"
)

// ErrNotImplemented is returned until Batch 3 implements the spec.
var ErrNotImplemented = errors.New("tiles: not implemented (Batch 3, see docs/perfect/WORLD-HIERARCHY-SPEC.md)")

// Key is one tile in the zoom scheme. Z is the zoom level; X and Y are the
// tile coordinates within it. The concrete scheme (place-tree vs quadtree) is
// chosen by the spec - the key shape is stable either way.
type Key struct {
	Z int
	X int
	Y int
}

// Marker is one club drawn on a tile, at the prominence tier for the zoom.
type Marker struct {
	ClubID     string
	Name       string
	Prominence float64
	X          float64
	Y          float64
}

// Tile is a bounded response. Size reports the serialized bytes so callers can
// assert the payload budget.
type Tile struct {
	Key      Key
	Markers  []Marker
	NextZoom *Key
}

// Builder builds a tile for a viewport at a zoom level.
type Builder interface {
	Build(ctx context.Context, key Key) (Tile, error)
}

// Service is the default Builder.
type Service struct{}

// New returns a Builder.
func New() *Service { return &Service{} }

// Build is the not-implemented Batch 1 seam.
func (s *Service) Build(ctx context.Context, key Key) (Tile, error) {
	return Tile{}, ErrNotImplemented
}
