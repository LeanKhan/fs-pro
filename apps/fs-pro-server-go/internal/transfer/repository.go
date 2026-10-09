package transfer

import (
	"context"
	"time"

	"fs-pro-server/internal/db"
)

// Repository reads/writes the transfer window on the singleton Calendars row.
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// Q exposes the querier for access checks.
func (r *Repository) Q() db.Querier { return r.q }

// Window reads the window state.
func (r *Repository) Window(ctx context.Context) (WindowState, error) {
	rows, err := r.q.Query(ctx, `SELECT "CurrentDay","TransferWindowOpen","TransferWindowClosesDay" FROM "Calendars" LIMIT 1`)
	if err != nil {
		return WindowState{}, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return WindowState{Open: false}, err
	}
	var closes *int
	if v, ok := m["TransferWindowClosesDay"]; ok && v != nil {
		if n, ok := asInt(v); ok {
			closes = &n
		}
	}
	open, _ := m["TransferWindowOpen"].(bool)
	day, _ := asInt(m["CurrentDay"])
	return NewWindowState(open, closes, day), nil
}

// SetWindow opens/closes the window, optionally for N days.
func (r *Repository) SetWindow(ctx context.Context, open bool, days *int) (WindowState, error) {
	current, err := r.Window(ctx)
	if err != nil {
		return WindowState{}, err
	}
	patch := map[string]any{"TransferWindowOpen": open, "updatedAt": time.Now()}
	if !open {
		patch["TransferWindowClosesDay"] = nil
	} else if days != nil {
		patch["TransferWindowClosesDay"] = current.CurrentDay + *days
	}
	if _, err := db.UpdateRow(ctx, r.q, "Calendars", "_id", r.calendarID(ctx), patch, false); err != nil {
		return WindowState{}, err
	}
	return r.Window(ctx)
}

func (r *Repository) calendarID(ctx context.Context) string {
	rows, err := r.q.Query(ctx, `SELECT "_id" FROM "Calendars" LIMIT 1`)
	if err != nil {
		return ""
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return ""
	}
	return db.StringField(m, "_id")
}

func asInt(v any) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int32:
		return int(n), true
	case int64:
		return int(n), true
	case float64:
		return int(n), true
	case float32:
		return int(n), true
	default:
		return 0, false
	}
}
