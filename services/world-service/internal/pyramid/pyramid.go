// Package pyramid assigns clubs to divisions and pools for a country's
// pyramid (docs/WORLD-PYRAMID-SPEC.md, docs/perfect/WORLD-HIERARCHY-SPEC.md).
// Batch 2 implements pool assignment and the promotion/relegation movement;
// Node's pyramid.service.ts will delegate to it over HTTP.
//
// This is the Batch 1 skeleton: shapes plus an ErrNotImplemented seam.
package pyramid

import (
	"context"
	"errors"
)

// ErrNotImplemented is returned until Batch 2 implements the spec.
var ErrNotImplemented = errors.New("pyramid: not implemented (Batch 2, see docs/perfect/WORLD-HIERARCHY-SPEC.md)")

// Club is the input to pool assignment: which country/region it belongs to,
// the division it is entering, and its prominence (ranking.Scored).
type Club struct {
	ClubID     string
	CountryID  string
	RegionID   string
	Division   int
	Prominence float64
}

// Pool is one assigned pool. Number is the order within the division.
type Pool struct {
	Division int
	Number   int
	RegionID string
	ClubIDs  []string
}

// Assignment is the draw result for one edition.
type Assignment struct {
	Pools []Pool
}

// Options tune locality (pool by region > city > district) and pool size.
type Options struct {
	PoolSize    int
	MaxDivision int
}

// Assigner assigns clubs to pools. Batch 2 implements it as a pure function so
// it can be property-tested at 1M scale (every club in exactly one pool).
type Assigner interface {
	Assign(ctx context.Context, clubs []Club, opts Options) (Assignment, error)
}

// Service is the default Assigner.
type Service struct{}

// New returns an Assigner.
func New() *Service { return &Service{} }

// Assign is the not-implemented Batch 1 seam.
func (s *Service) Assign(ctx context.Context, clubs []Club, opts Options) (Assignment, error) {
	return Assignment{}, ErrNotImplemented
}
