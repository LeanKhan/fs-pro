package grid

import (
	"context"
	"errors"
	"fmt"
)

// ErrNoLayout is returned by MatchPayload when the requested slot has never
// been saved.
var ErrNoLayout = errors.New("grid: no layout saved in that slot")

// InvalidLayoutError is a typed, client-consumable refusal from SaveLayout. It
// carries the exact Validate reason string (or an unknown-slot message) so the
// client can display it verbatim, mirroring the server's authoritative rules.
type InvalidLayoutError struct {
	Slot   LayoutSlot
	Reason string
}

func (e InvalidLayoutError) Error() string { return e.Reason }

// Service is the layout save/read boundary: it validates before persisting and
// compiles a stored grid into the sim-service payload. The server is
// authoritative - a client only ever sends a grid, never an outcome.
type Service struct {
	repo Repository
}

// NewService wraps a Repository.
func NewService(r Repository) *Service { return &Service{repo: r} }

// SaveLayout validates g for the club's Clubhouse tier and, when legal,
// persists it into slot. An unknown slot or an invalid grid is refused with an
// InvalidLayoutError and nothing is written.
func (s *Service) SaveLayout(ctx context.Context, clubID string, slot LayoutSlot, g Grid, clubhouseTier int) error {
	if !ValidSlot(slot) {
		return InvalidLayoutError{Slot: slot, Reason: fmt.Sprintf("Unknown layout slot %q", string(slot))}
	}
	if reason := Validate(g, clubhouseTier); reason != "" {
		return InvalidLayoutError{Slot: slot, Reason: reason}
	}
	return s.repo.SetLayout(ctx, clubID, slot, g)
}

// MatchPayload compiles the stored slot into the sim-service payload: the 11
// formation slots (`tactics.<side>.slots`) and the ordered starting XI
// (`lineup.startingXI`). It returns ErrNoLayout when the slot is empty.
func (s *Service) MatchPayload(ctx context.Context, clubID string, slot LayoutSlot) (slots []SimSlot, startingXI []string, err error) {
	layouts, err := s.repo.GetLayouts(ctx, clubID)
	if err != nil {
		return nil, nil, err
	}
	g, ok := layouts.Grid(slot)
	if !ok || len(g.Slots) == 0 {
		return nil, nil, ErrNoLayout
	}
	return SimSlots(g), StartingXI(g), nil
}
