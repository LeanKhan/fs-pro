package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"time"

	"fs-pro-server/internal/db"

	"github.com/jackc/pgx/v5"
)

// TokenKind identifies a one-time email link.
type TokenKind string

// Token kinds.
const (
	TokenVerify TokenKind = "verify"
	TokenReset  TokenKind = "reset"
)

// TokenTTL mirrors email-token.service.ts (24h verify, 1h reset).
var TokenTTL = map[TokenKind]time.Duration{
	TokenVerify: 24 * time.Hour,
	TokenReset:  time.Hour,
}

// TokenStore issues and consumes one-time email tokens.
type TokenStore interface {
	Issue(ctx context.Context, userID string, kind TokenKind) (string, error)
	Consume(ctx context.Context, token string, kind TokenKind) (userID string, ok bool, err error)
}

// PgTokenStore reads/writes the "AuthTokens" table.
type PgTokenStore struct {
	q db.Querier
}

// NewPgTokenStore wraps a Querier.
func NewPgTokenStore(q db.Querier) *PgTokenStore { return &PgTokenStore{q: q} }

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// Issue mints a 32-byte token, voids the user's prior unused tokens of the same
// kind and stores the new hash in one atomic statement (a data-modifying CTE).
func (s *PgTokenStore) Issue(ctx context.Context, userID string, kind TokenKind) (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(b[:])
	expires := time.Now().Add(tokenTTL(kind))
	_, err := s.q.Exec(ctx, `
		WITH voided AS (
			UPDATE "AuthTokens" SET "UsedAt" = now()
			WHERE "UserId" = $1 AND "Kind" = $2 AND "UsedAt" IS NULL
		)
		INSERT INTO "AuthTokens" ("UserId", "Kind", "TokenHash", "ExpiresAt")
		VALUES ($1, $2, $3, $4)`,
		userID, string(kind), hashToken(token), expires)
	if err != nil {
		return "", err
	}
	return token, nil
}

// Consume marks the token used and returns its user id, or ok=false when the
// token is unknown, expired, used or of another kind.
func (s *PgTokenStore) Consume(ctx context.Context, token string, kind TokenKind) (string, bool, error) {
	if token == "" || len(token) > 200 {
		return "", false, nil
	}
	var userID string
	err := s.q.QueryRow(ctx, `
		UPDATE "AuthTokens" SET "UsedAt" = now()
		WHERE "TokenHash" = $1 AND "Kind" = $2 AND "UsedAt" IS NULL AND "ExpiresAt" > now()
		RETURNING "UserId"::text`,
		hashToken(token), string(kind)).Scan(&userID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", false, nil
		}
		return "", false, err
	}
	return userID, true, nil
}

func tokenTTL(kind TokenKind) time.Duration {
	if d, ok := TokenTTL[kind]; ok {
		return d
	}
	return 24 * time.Hour
}
