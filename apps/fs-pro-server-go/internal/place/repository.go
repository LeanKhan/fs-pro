// Package place implements the places.* routes over the "Places" table.
package place

import (
	"context"
	"time"

	"fs-pro-server/internal/db"
)

// Filter narrows a place list.
type Filter struct {
	Type      string
	HasType   bool
	Code      string
	HasCode   bool
	Name      string
	HasName   bool
	Region    string
	HasRegion bool
}

// Repository is the pgx-backed Place store.
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// FindAll returns places matching the filter.
func (r *Repository) FindAll(ctx context.Context, f Filter) ([]map[string]any, error) {
	conditions := make([]string, 0, 4)
	args := make([]any, 0, 4)
	add := func(col, value string) {
		args = append(args, value)
		conditions = append(conditions, `"`+col+`" = $`+itoa(len(args)))
	}
	if f.HasType {
		add("Type", f.Type)
	}
	if f.HasCode {
		add("Code", f.Code)
	}
	if f.HasName {
		add("Name", f.Name)
	}
	if f.HasRegion {
		add("Region", f.Region)
	}
	sql := `SELECT * FROM "Places"`
	if len(conditions) > 0 {
		sql += " WHERE " + joinAnd(conditions)
	}
	rows, err := r.q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

// FindByID returns one place (ok=false when missing).
func (r *Repository) FindByID(ctx context.Context, id string) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Places" WHERE "_id" = $1 LIMIT 1`, id)
	if err != nil {
		return nil, false, err
	}
	m, ok, err := db.ScanOne(rows)
	return m, ok, err
}

// FindByNameOrCode matches Name or Code.
func (r *Repository) FindByNameOrCode(ctx context.Context, value string) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Places" WHERE "Name" = $1 OR "Code" = $1 LIMIT 1`, value)
	if err != nil {
		return nil, false, err
	}
	m, ok, err := db.ScanOne(rows)
	return m, ok, err
}

// Create inserts a place (updatedAt set explicitly).
func (r *Repository) Create(ctx context.Context, data map[string]any) (map[string]any, error) {
	insert := db.CopyMap(data)
	insert["updatedAt"] = time.Now()
	return db.InsertRow(ctx, r.q, "Places", insert)
}

// Update writes plain fields; ok=false when the place doesn't exist.
func (r *Repository) Update(ctx context.Context, id string, data map[string]any) (map[string]any, bool, error) {
	m, err := db.UpdateRow(ctx, r.q, "Places", "_id", id, data, true)
	if err != nil {
		return nil, false, err
	}
	return m, m != nil, nil
}
