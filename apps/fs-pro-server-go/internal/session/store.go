package session

import (
	"context"
	"time"

	"fs-pro-server/internal/db"
)

// Store is the persistence surface the session Manager needs. PgStore is the
// Postgres implementation; tests inject a fake.
type Store interface {
	Get(ctx context.Context, sid string) (map[string]any, error)
	Set(ctx context.Context, sid string, data map[string]any) error
	Destroy(ctx context.Context, sid string) error
	Touch(ctx context.Context, sid string, expires time.Time) error
}

// PgStore reads/writes the same "Sessions" table the Node PgSessionStore uses.
type PgStore struct {
	q db.Querier
}

// NewPgStore wraps a Querier (the pgx pool).
func NewPgStore(q db.Querier) *PgStore { return &PgStore{q: q} }

// Get returns the stored session object, or nil when the row is missing or
// expired.
func (s *PgStore) Get(ctx context.Context, sid string) (map[string]any, error) {
	rows, err := s.q.Query(ctx, `SELECT session FROM "Sessions" WHERE sid = $1 AND expires > now()`, sid)
	if err != nil {
		return nil, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return nil, err
	}
	if session, ok := m["session"].(map[string]any); ok {
		return session, nil
	}
	return nil, nil
}

// Set upserts a session, computing `expires` from the cookie's maxAge exactly
// like PgSessionStore.set.
func (s *PgStore) Set(ctx context.Context, sid string, data map[string]any) error {
	expires := time.Now().Add(maxAge(data))
	_, err := s.q.Exec(ctx,
		`INSERT INTO "Sessions" (sid, session, expires) VALUES ($1, $2, $3)
		 ON CONFLICT (sid) DO UPDATE SET session = EXCLUDED.session, expires = EXCLUDED.expires`,
		sid, data, expires)
	return err
}

// Destroy deletes a session row.
func (s *PgStore) Destroy(ctx context.Context, sid string) error {
	_, err := s.q.Exec(ctx, `DELETE FROM "Sessions" WHERE sid = $1`, sid)
	return err
}

// Touch extends a session's expiry.
func (s *PgStore) Touch(ctx context.Context, sid string, expires time.Time) error {
	_, err := s.q.Exec(ctx, `UPDATE "Sessions" SET expires = $2 WHERE sid = $1`, sid, expires)
	return err
}

// DeleteByUserID removes every session whose stored userID matches. It backs
// Manager.Revoke and mirrors utils/auth.ts's revokeSessions SQL.
func (s *PgStore) DeleteByUserID(ctx context.Context, userID string) error {
	_, err := s.q.Exec(ctx, `DELETE FROM "Sessions" WHERE session->>'userID' = $1`, userID)
	return err
}

const defaultMaxAge = 24 * time.Hour

func maxAge(data map[string]any) time.Duration {
	cookie, ok := data["cookie"].(map[string]any)
	if !ok {
		return defaultMaxAge
	}
	ms, ok := number(cookie["maxAge"])
	if !ok || ms <= 0 {
		return defaultMaxAge
	}
	return time.Duration(ms) * time.Millisecond
}

func number(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	default:
		return 0, false
	}
}
