package grid

import (
	"context"
	"errors"
	"fmt"
)

// ErrNoLayout is returned by MatchPayload when the requested slot has never
// been saved.
var ErrNoLayout = errors.New("grid: no layout saved in that slot")

// ErrShareCodesExhausted means every generated share code collided; it should
// never happen (40 bits of entropy) but is surfaced rather than looping.
var ErrShareCodesExhausted = errors.New("grid: could not allocate a layout share code")

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

// Layouts returns the club's stored layout document (empty when nothing is
// saved). It is the read behind GET /api/clubs/{id}/layouts.
func (s *Service) Layouts(ctx context.Context, clubID string) (Layouts, error) {
	return s.repo.GetLayouts(ctx, clubID)
}

// PublishLayout publishes the club's stored slot as a share code and returns
// the code. An empty slot is ErrNoLayout; a code collision is retried.
func (s *Service) PublishLayout(ctx context.Context, clubID string, slot LayoutSlot) (Published, error) {
	if !ValidSlot(slot) {
		return Published{}, InvalidLayoutError{Slot: slot, Reason: fmt.Sprintf("Unknown layout slot %q", string(slot))}
	}
	layouts, err := s.repo.GetLayouts(ctx, clubID)
	if err != nil {
		return Published{}, err
	}
	g, ok := layouts.Grid(slot)
	if !ok || len(g.Slots) == 0 {
		return Published{}, ErrNoLayout
	}
	for attempt := 0; attempt < 5; attempt++ {
		code, err := NewShareCode()
		if err != nil {
			return Published{}, err
		}
		err = s.repo.Publish(ctx, code, clubID, slot, g)
		if errors.Is(err, ErrShareCodeTaken) {
			continue
		}
		if err != nil {
			return Published{}, err
		}
		return Published{Code: code, ClubID: clubID, Slot: slot, Grid: g}, nil
	}
	return Published{}, ErrShareCodesExhausted
}

// ImportLayout clones the layout published under code into the importing club's
// slot. The grid is validated against the *importing* club's Clubhouse tier, so
// a shared shape can never bypass the tier gate (04/03 server-authoritative
// rules). An unknown code is ErrNoShareCode.
func (s *Service) ImportLayout(ctx context.Context, code, clubID string, slot LayoutSlot, clubhouseTier int) (Grid, error) {
	if !ValidSlot(slot) {
		return Grid{}, InvalidLayoutError{Slot: slot, Reason: fmt.Sprintf("Unknown layout slot %q", string(slot))}
	}
	pub, err := s.repo.Import(ctx, code)
	if err != nil {
		return Grid{}, err
	}
	if reason := Validate(pub.Grid, clubhouseTier); reason != "" {
		return Grid{}, InvalidLayoutError{Slot: slot, Reason: reason}
	}
	if err := s.repo.SetLayout(ctx, clubID, slot, pub.Grid); err != nil {
		return Grid{}, err
	}
	return pub.Grid, nil
}
