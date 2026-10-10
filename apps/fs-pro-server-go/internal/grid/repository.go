package grid

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"fs-pro-server/internal/db"
)

// Repository is the persistence boundary for a club's layout slots. The API
// layer talks to a Service, never to a Repository directly.
type Repository interface {
	// GetLayouts returns the club's stored layout document. A club with no
	// saved layouts yields an empty (non-nil) Layouts, not an error.
	GetLayouts(ctx context.Context, clubID string) (Layouts, error)
	// SetLayout stores g in one slot, leaving the club's other slots untouched.
	SetLayout(ctx context.Context, clubID string, slot LayoutSlot, g Grid) error
}

// MemoryRepository is an in-process Repository for tests and local development.
// It is safe for concurrent use and clones every grid in and out, so callers
// never share mutable state with the store. GetLayouts returns whole maps, so
// ordering is the caller's concern (see Layouts.Slots).
type MemoryRepository struct {
	mu   sync.Mutex
	data map[string]Layouts
}

// NewMemoryRepository returns an empty in-memory store.
func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{data: make(map[string]Layouts)}
}

// GetLayouts returns a deep copy of the club's layouts (empty when none).
func (r *MemoryRepository) GetLayouts(_ context.Context, clubID string) (Layouts, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return cloneLayouts(r.data[clubID]), nil
}

// SetLayout stores a copy of g in slot for clubID.
func (r *MemoryRepository) SetLayout(_ context.Context, clubID string, slot LayoutSlot, g Grid) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	l := r.data[clubID]
	if l == nil {
		l = make(Layouts)
		r.data[clubID] = l
	}
	l[slot] = cloneGrid(g)
	return nil
}

// PgRepository is the pgx-backed Repository. It targets a Clubs.Layouts JSONB
// column and writes one slot with an atomic jsonb_set, so two concurrent slot
// saves cannot clobber each other (a read-modify-write would lose one).
//
// IMPORTANT: this column does NOT exist yet. docs/coc-mapping/05 §8 lists
// Clubs.Layouts as an additive migration that has not been applied. This type
// is declared and compiled so the service can be wired the moment the migration
// lands, but it must NOT be handed a live database until then.
type PgRepository struct {
	q db.Querier
}

// NewPgRepository wraps a Querier.
func NewPgRepository(q db.Querier) *PgRepository { return &PgRepository{q: q} }

// Q exposes the querier for access checks.
func (r *PgRepository) Q() db.Querier { return r.q }

// GetLayouts reads Clubs.Layouts. A missing club row, a NULL column or an empty
// object all yield an empty (non-nil) Layouts.
func (r *PgRepository) GetLayouts(ctx context.Context, clubID string) (Layouts, error) {
	rows, err := r.q.Query(ctx, `SELECT "Layouts" FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
	if err != nil {
		return nil, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil {
		return nil, err
	}
	if !ok {
		// A missing club row is not an error: the interface contract promises
		// an empty (non-nil) Layouts, exactly like MemoryRepository.
		return Layouts{}, nil
	}
	return decodeLayouts(m["Layouts"])
}

// SetLayout writes g into one slot in a single statement, creating the
// document when the column is NULL. It returns an error when the club row does
// not exist.
func (r *PgRepository) SetLayout(ctx context.Context, clubID string, slot LayoutSlot, g Grid) error {
	rows, err := r.q.Query(ctx, `UPDATE "Clubs"
		SET "Layouts" = jsonb_set(coalesce("Layouts", '{}'::jsonb), $2::text[], $3::jsonb, true),
		    "updatedAt" = now()
		WHERE "_id" = $1
		RETURNING "_id"`, clubID, []string{string(slot)}, g)
	if err != nil {
		return err
	}
	_, ok, err := db.ScanOne(rows)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("grid: club %s not found", clubID)
	}
	return nil
}

// decodeLayouts converts a JSONB value decoded by db.ScanOne (map[string]any)
// back into a Layouts document. It re-encodes through the custom codec so the
// exact same slot rules apply on the read and write paths.
func decodeLayouts(v any) (Layouts, error) {
	if v == nil {
		return Layouts{}, nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	var l Layouts
	if err := json.Unmarshal(b, &l); err != nil {
		return nil, err
	}
	if l == nil {
		l = Layouts{}
	}
	return l, nil
}
