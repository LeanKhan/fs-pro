// Package manager implements the managers.* routes and the Manager repository,
// injecting Club (narrow) and Nationality exactly when the Node
// DrizzleManagerRepository does.
package manager

import (
	"context"
	"strconv"
	"strings"
	"time"

	"fs-pro-server/internal/db"
)

// Filter narrows a manager list.
type Filter struct {
	IsEmployed    bool
	HasIsEmployed bool
	ClubID        string
	HasClubID     bool
}

// ReadOptions selects relations.
type ReadOptions struct {
	WithClub        bool
	WithNationality bool
}

// Repository is the pgx-backed Manager store.
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// FindByID returns one manager.
func (r *Repository) FindByID(ctx context.Context, id string, opts ReadOptions) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Managers" WHERE "_id" = $1 LIMIT 1`, id)
	if err != nil {
		return nil, false, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return nil, false, err
	}
	if err := r.inject(ctx, []map[string]any{m}, opts); err != nil {
		return nil, false, err
	}
	return m, true, nil
}

// FindAll returns managers matching the filter.
func (r *Repository) FindAll(ctx context.Context, f Filter, opts ReadOptions) ([]map[string]any, error) {
	conditions := make([]string, 0, 2)
	args := make([]any, 0, 2)
	if f.HasIsEmployed {
		args = append(args, f.IsEmployed)
		conditions = append(conditions, `"isEmployed" = $1`)
	}
	if f.HasClubID {
		args = append(args, f.ClubID)
		conditions = append(conditions, `"ClubId" = $`+itoa(len(args)))
	}
	sql := `SELECT * FROM "Managers"`
	if len(conditions) > 0 {
		sql += " WHERE " + joinAnd(conditions)
	}
	rows, err := r.q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	if err := r.inject(ctx, list, opts); err != nil {
		return nil, err
	}
	return list, nil
}

// Create inserts a manager (updatedAt set explicitly).
func (r *Repository) Create(ctx context.Context, data map[string]any) (map[string]any, error) {
	insert := db.CopyMap(data)
	insert["updatedAt"] = time.Now()
	return db.InsertRow(ctx, r.q, "Managers", insert)
}

// Update writes plain fields.
func (r *Repository) Update(ctx context.Context, id string, data map[string]any) (map[string]any, bool, error) {
	m, err := db.UpdateRow(ctx, r.q, "Managers", "_id", id, data, true)
	if err != nil {
		return nil, false, err
	}
	return m, m != nil, nil
}

// Delete removes a manager and returns the deleted row.
func (r *Repository) Delete(ctx context.Context, id string) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `DELETE FROM "Managers" WHERE "_id" = $1 RETURNING *`, id)
	if err != nil {
		return nil, false, err
	}
	m, ok, err := db.ScanOne(rows)
	return m, ok, err
}

// AppendRecord updates fields and appends a Records entry, mirroring
// appendManagerRecord.
func (r *Repository) AppendRecord(ctx context.Context, id string, fields map[string]any, record any) (map[string]any, error) {
	current, _, err := r.FindByID(ctx, id, ReadOptions{})
	if err != nil {
		return nil, err
	}
	records := db.JSONArray(current["Records"])
	records = append(records, record)
	update := db.CopyMap(fields)
	update["Records"] = records
	m, err := db.UpdateRow(ctx, r.q, "Managers", "_id", id, update, true)
	return m, err
}

// ManagerByID is a convenience for callers that only have an interface
// (clubs' hire/fire flow) and don't need relations.
func (r *Repository) ManagerByID(ctx context.Context, id string) (map[string]any, bool, error) {
	return r.FindByID(ctx, id, ReadOptions{})
}

// AppendManagerRecord is the exported convenience wrapper for AppendRecord.
func (r *Repository) AppendManagerRecord(ctx context.Context, id string, fields map[string]any, record any) (map[string]any, error) {
	return r.AppendRecord(ctx, id, fields, record)
}

func (r *Repository) inject(ctx context.Context, managers []map[string]any, opts ReadOptions) error {
	if len(managers) == 0 || (!opts.WithClub && !opts.WithNationality) {
		return nil
	}
	if opts.WithNationality {
		places, err := r.loadPlaces(ctx, db.CollectIDs(managers, "NationalityId"))
		if err != nil {
			return err
		}
		for _, m := range managers {
			if id := db.StringField(m, "NationalityId"); id != "" {
				if p := places[id]; p != nil {
					m["Nationality"] = p
				}
			}
		}
	}
	if opts.WithClub {
		clubs, err := r.loadClubs(ctx, db.CollectIDs(managers, "ClubId"))
		if err != nil {
			return err
		}
		for _, m := range managers {
			if id := db.StringField(m, "ClubId"); id != "" {
				if c := clubs[id]; c != nil {
					m["Club"] = c
				}
			}
		}
	}
	return nil
}

func (r *Repository) loadPlaces(ctx context.Context, ids []string) (map[string]map[string]any, error) {
	out := map[string]map[string]any{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := r.q.Query(ctx, `SELECT * FROM "Places" WHERE "_id"::text = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	for _, p := range list {
		out[db.StringField(p, "_id")] = p
	}
	return out, nil
}

// loadClubs returns the narrow {_id,Name,ClubCode} projection Node populates.
func (r *Repository) loadClubs(ctx context.Context, ids []string) (map[string]map[string]any, error) {
	out := map[string]map[string]any{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := r.q.Query(ctx, `SELECT "_id", "Name", "ClubCode" FROM "Clubs" WHERE "_id"::text = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	for _, c := range list {
		out[db.StringField(c, "_id")] = c
	}
	return out, nil
}

func itoa(n int) string { return strconv.Itoa(n) }

func joinAnd(conditions []string) string { return strings.Join(conditions, " AND ") }
