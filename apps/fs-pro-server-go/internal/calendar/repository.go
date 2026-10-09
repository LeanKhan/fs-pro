// Package calendar implements the calendar.* routes over the singleton
// "Calendars" row, the sparse "Days" table and "SeasonReports".
package calendar

import (
	"context"
	"time"

	"fs-pro-server/internal/db"
)

// Repository is the pgx-backed Calendar store.
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// Calendar returns the singleton row, creating it when missing.
func (r *Repository) Calendar(ctx context.Context) (map[string]any, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Calendars" LIMIT 1`)
	if err != nil {
		return nil, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil {
		return nil, err
	}
	if ok {
		db.Omit(m, "singleton")
		return m, nil
	}
	insert, err := db.InsertRow(ctx, r.q, "Calendars", map[string]any{
		"CurrentDay":  0,
		"CurrentDate": time.Now(),
		"updatedAt":   time.Now(),
	})
	if err != nil {
		return nil, err
	}
	db.Omit(insert, "singleton")
	return insert, nil
}

// UpdateCalendar writes calendar fields, refreshing updatedAt.
func (r *Repository) UpdateCalendar(ctx context.Context, id string, data map[string]any) (map[string]any, error) {
	m, err := db.UpdateRow(ctx, r.q, "Calendars", "_id", id, data, true)
	if err != nil || m == nil {
		return m, err
	}
	db.Omit(m, "singleton")
	return m, nil
}

// DaysInRange returns sparse calendar-event days with Index in [from, to].
func (r *Repository) DaysInRange(ctx context.Context, from, to int) ([]map[string]any, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Days" WHERE "Index" >= $1 AND "Index" <= $2 ORDER BY "Index"`, from, to)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

// DeleteDay removes a day, returning ok=false when it doesn't exist.
func (r *Repository) DeleteDay(ctx context.Context, id string) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `DELETE FROM "Days" WHERE "_id" = $1 RETURNING *`, id)
	if err != nil {
		return nil, false, err
	}
	m, ok, err := db.ScanOne(rows)
	return m, ok, err
}

// SeasonReports returns report payloads, newest cycle first.
func (r *Repository) SeasonReports(ctx context.Context) ([]map[string]any, error) {
	rows, err := r.q.Query(ctx, `SELECT "Data" FROM "SeasonReports" ORDER BY "createdAt" DESC`)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(list))
	for _, row := range list {
		if data, ok := row["Data"].(map[string]any); ok {
			out = append(out, data)
		}
	}
	return out, nil
}

// SeasonReport returns one report payload by Year.
func (r *Repository) SeasonReport(ctx context.Context, year string) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `SELECT "Data" FROM "SeasonReports" WHERE "Year" = $1 LIMIT 1`, year)
	if err != nil {
		return nil, false, err
	}
	row, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return nil, false, err
	}
	data, _ := row["Data"].(map[string]any)
	if data == nil {
		return nil, false, nil
	}
	return data, true, nil
}
