// Package placement owns where a new club lands in the country > region >
// city > district hierarchy (D1) and the hierarchy queries over it. Batch 2
// implements the algorithm from docs/perfect/WORLD-HIERARCHY-SPEC.md - local
// fill first, invites honoured, capacity growth by opening districts.
//
// This is the Batch 1 skeleton: it declares the seam and the shapes Batch 2
// fills in, and returns ErrNotImplemented so nothing ships half-built.
package placement

import (
	"context"
	"errors"
)

// ErrNotImplemented is returned until Batch 2 implements the spec.
var ErrNotImplemented = errors.New("placement: not implemented (Batch 2, see docs/perfect/WORLD-HIERARCHY-SPEC.md)")

// Path is one chain through the place tree, country > region > city >
// district. Ids are the Places rows' primary keys as strings.
type Path struct {
	CountryID  string
	RegionID   string
	CityID     string
	DistrictID string
}

// Request is a placement request. InviteTownID is set when the founder arrived
// through a town invite and overrides the default fill order.
type Request struct {
	CountryID    string
	InviteTownID string
	OwnerUserID  string
}

// Spot is the placement outcome. Created* flag the districts/cities that had
// to be opened to make room.
type Spot struct {
	Path            Path
	Slot            int
	CreatedCity     bool
	CreatedDistrict bool
}

// Locator is the placement seam. Batch 2 implements it against the db.Pool
// under the same advisory-lock semantics as the current Node founding.
type Locator interface {
	Place(ctx context.Context, req Request) (Spot, error)
	// Children returns the direct children of placeID, optionally filtered
	// by kind ("region" | "city" | "district").
	Children(ctx context.Context, placeID, kind string) ([]Path, error)
}

// Service is the default Locator.
type Service struct{}

// New returns a Locator.
func New() *Service { return &Service{} }

// Place is the not-implemented Batch 1 seam.
func (s *Service) Place(ctx context.Context, req Request) (Spot, error) {
	return Spot{}, ErrNotImplemented
}

// Children is the not-implemented Batch 1 seam.
func (s *Service) Children(ctx context.Context, placeID, kind string) ([]Path, error) {
	return nil, ErrNotImplemented
}
