// Package ranking owns the prominence score and the ordering of clubs for the
// map (D2) and for pyramid seeding. Prominence is defined by
// docs/perfect/WORLD-HIERARCHY-SPEC.md from stored fields only - Division,
// Level (derived from XP), Elo, Fans and Reputation.
//
// This is the Batch 1 skeleton: the seam and the wire types exist so Batch 2
// can fill in the score without touching callers. It contains no scoring
// formula on purpose - the exact weights are the owner-approved spec's job.
package ranking

import (
	"context"
	"errors"
)

// ErrNotImplemented is returned until Batch 2 implements the spec.
var ErrNotImplemented = errors.New("ranking: not implemented (Batch 2, see docs/perfect/WORLD-HIERARCHY-SPEC.md)")

// Metrics are the stored club fields the prominence score reads. Level is
// derived from XP, never stored.
type Metrics struct {
	ClubID     string
	Division   int
	XP         int
	Elo        float64
	Fans       int
	Reputation int
}

// Scored is one club's prominence, higher = more prominent.
type Scored struct {
	ClubID string
	Score  float64
}

// Ranker orders clubs by prominence. Batch 2 implements it as a pure function
// over []Metrics so it is property-testable at 1M scale.
type Ranker interface {
	Rank(ctx context.Context, clubs []Metrics) ([]Scored, error)
}

// Service is the default Ranker.
type Service struct{}

// New returns a Ranker.
func New() *Service { return &Service{} }

// Rank is the not-implemented Batch 1 seam.
func (s *Service) Rank(ctx context.Context, clubs []Metrics) ([]Scored, error) {
	return nil, ErrNotImplemented
}
