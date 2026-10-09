// Package award implements the single awards.* route.
package award

import (
	"context"

	"fs-pro-server/internal/db"
)

// Repository is the pgx-backed Award store.
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// FindAll returns awards for a season (all awards when seasonID is empty).
func (r *Repository) FindAll(ctx context.Context, seasonID string) ([]map[string]any, error) {
	sql := `SELECT * FROM "Awards"`
	args := []any{}
	if seasonID != "" {
		args = append(args, seasonID)
		sql += ` WHERE "SeasonId" = $1`
	}
	rows, err := r.q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}
