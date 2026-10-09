package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"fs-pro-server/internal/db"

	"github.com/jackc/pgx/v5/pgconn"
)

// UserStore is the account persistence surface. PgUserStore is the Postgres
// implementation; tests inject a fake.
type UserStore interface {
	FindByID(ctx context.Context, id string) (map[string]any, error)
	FindByUsername(ctx context.Context, username string) (map[string]any, error)
	FindByEmail(ctx context.Context, email string) (map[string]any, error)
	Create(ctx context.Context, data map[string]any) (map[string]any, error)
	Update(ctx context.Context, id string, data map[string]any) (map[string]any, error)
}

// ConflictError signals a unique-constraint clash. Email distinguishes the
// email index (mirrors `err.cause.constraint_name` matching /email/i).
type ConflictError struct {
	Email bool
	Err   error
}

func (e *ConflictError) Error() string {
	if e.Err != nil {
		return e.Err.Error()
	}
	return "conflict"
}

func (e *ConflictError) Unwrap() error { return e.Err }

func conflictFrom(err error) error {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		return err
	}
	haystack := pgErr.ConstraintName
	if haystack == "" {
		haystack = pgErr.Detail
	}
	return &ConflictError{Email: strings.Contains(strings.ToLower(haystack), "email"), Err: err}
}

// SanitizeUser strips Password/Session/EmailVerifiedAt and adds the derived
// EmailVerified boolean, exactly like user.router.ts's sanitizeUser. A nil
// input returns nil.
func SanitizeUser(user map[string]any) map[string]any {
	if user == nil {
		return nil
	}
	out := make(map[string]any, len(user)+1)
	for k, v := range user {
		switch k {
		case "Password", "Session", "EmailVerifiedAt":
			continue
		default:
			out[k] = v
		}
	}
	out["EmailVerified"] = user["EmailVerifiedAt"] != nil
	return out
}

// PgUserStore reads/writes the "Users" table.
type PgUserStore struct {
	q db.Querier
}

// NewPgUserStore wraps a Querier.
func NewPgUserStore(q db.Querier) *PgUserStore { return &PgUserStore{q: q} }

// FindByID returns the user row keyed by "Users"."_id".
func (s *PgUserStore) FindByID(ctx context.Context, id string) (map[string]any, error) {
	return s.findOne(ctx, `SELECT * FROM "Users" WHERE "_id" = $1 LIMIT 1`, id)
}

// FindByUsername matches the unique Username.
func (s *PgUserStore) FindByUsername(ctx context.Context, username string) (map[string]any, error) {
	return s.findOne(ctx, `SELECT * FROM "Users" WHERE "Username" = $1 LIMIT 1`, username)
}

// FindByEmail matches case-insensitively, like the Drizzle repository.
func (s *PgUserStore) FindByEmail(ctx context.Context, email string) (map[string]any, error) {
	return s.findOne(ctx, `SELECT * FROM "Users" WHERE lower("Email") = $1 LIMIT 1`, strings.ToLower(strings.TrimSpace(email)))
}

func (s *PgUserStore) findOne(ctx context.Context, sql string, args ...any) (map[string]any, error) {
	rows, err := s.q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return nil, err
	}
	return m, nil
}

// Create hashes Password (when present) and inserts the row. updatedAt is set
// explicitly because it has no database default, matching the Node repository.
func (s *PgUserStore) Create(ctx context.Context, data map[string]any) (map[string]any, error) {
	insert := make(map[string]any, len(data)+1)
	for k, v := range data {
		insert[k] = v
	}
	if pw, ok := insert["Password"].(string); ok && pw != "" {
		hashed, err := HashPassword(pw)
		if err != nil {
			return nil, err
		}
		insert["Password"] = hashed
	}
	insert["updatedAt"] = time.Now()
	m, err := db.InsertRow(ctx, s.q, "Users", insert)
	if err != nil {
		return nil, conflictFrom(err)
	}
	return m, nil
}

// Update hashes Password (when present), writes the given fields and refreshes
// updatedAt. A missing row yields (nil, nil).
func (s *PgUserStore) Update(ctx context.Context, id string, data map[string]any) (map[string]any, error) {
	update := make(map[string]any, len(data))
	for k, v := range data {
		update[k] = v
	}
	if pw, ok := update["Password"].(string); ok && pw != "" {
		hashed, err := HashPassword(pw)
		if err != nil {
			return nil, err
		}
		update["Password"] = hashed
	}
	m, err := db.UpdateRow(ctx, s.q, "Users", "_id", id, update, true)
	if err != nil {
		return nil, conflictFrom(err)
	}
	return m, nil
}
