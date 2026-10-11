package auth

import (
	"context"
	"errors"
	"regexp"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/policy"

	"github.com/jackc/pgx/v5"
)

// PgAccess implements policy.Access with the same lookups route-policy.ts runs.
type PgAccess struct {
	q db.Querier
}

// NewPgAccess wraps a Querier.
func NewPgAccess(q db.Querier) *PgAccess { return &PgAccess{q: q} }

// IsAdmin returns the user's admin flag; found is false for an unknown user.
func (a *PgAccess) IsAdmin(ctx context.Context, userID string) (bool, bool, error) {
	var isAdmin bool
	err := a.q.QueryRow(ctx, `SELECT "isAdmin" FROM "Users" WHERE "_id" = $1`, userID).Scan(&isAdmin)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, false, nil
	}
	if err != nil {
		return false, false, err
	}
	return isAdmin, true, nil
}

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// CanManageClub mirrors controllers/auth/club-access.ts's canManageClub: the
// club's owner or an admin may act for it. Returns (0,"") when allowed, else
// the exact Node status + message.
func CanManageClub(ctx context.Context, q db.Querier, userID, clubID string) (int, string) {
	if userID == "" {
		return 401, "Not logged in"
	}
	if !uuidPattern.MatchString(clubID) {
		return 404, "Club not found"
	}
	var owner *string
	err := q.QueryRow(ctx, `SELECT "UserId"::text FROM "Clubs" WHERE "_id" = $1`, clubID).Scan(&owner)
	if errors.Is(err, pgx.ErrNoRows) {
		return 404, "Club not found"
	}
	if err != nil {
		return 403, "You do not manage this club"
	}
	if owner != nil && *owner == userID {
		return 0, ""
	}
	var isAdmin bool
	if aerr := q.QueryRow(ctx, `SELECT "isAdmin" FROM "Users" WHERE "_id" = $1`, userID).Scan(&isAdmin); aerr == nil && isAdmin {
		return 0, ""
	}
	return 403, "You do not manage this club"
}

// IsAdminByID reports whether userID is an admin.
func IsAdminByID(ctx context.Context, q db.Querier, userID string) bool {
	if userID == "" {
		return false
	}
	var isAdmin bool
	if err := q.QueryRow(ctx, `SELECT "isAdmin" FROM "Users" WHERE "_id" = $1`, userID).Scan(&isAdmin); err != nil {
		return false
	}
	return isAdmin
}

// OwnsClub reports whether userID owns clubID.
func (a *PgAccess) OwnsClub(ctx context.Context, userID, clubID string) (policy.Ownership, error) {
	if clubID == "" {
		return policy.Missing, nil
	}
	var owner *string
	err := a.q.QueryRow(ctx, `SELECT "UserId"::text FROM "Clubs" WHERE "_id" = $1`, clubID).Scan(&owner)
	if errors.Is(err, pgx.ErrNoRows) {
		return policy.Missing, nil
	}
	if err != nil {
		return policy.Missing, err
	}
	if owner != nil && *owner == userID {
		return policy.Yes, nil
	}
	return policy.No, nil
}

// PlayerClub returns the player's club id.
func (a *PgAccess) PlayerClub(ctx context.Context, playerID string) (string, bool, error) {
	var clubID *string
	err := a.q.QueryRow(ctx, `SELECT "ClubId"::text FROM "Players" WHERE "_id" = $1`, playerID).Scan(&clubID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	if clubID == nil {
		return "", true, nil
	}
	return *clubID, true, nil
}

// FixtureTeams returns the fixture's home and away club ids.
func (a *PgAccess) FixtureTeams(ctx context.Context, fixtureID string) (string, string, bool, error) {
	var home, away *string
	err := a.q.QueryRow(ctx, `SELECT "HomeTeamId"::text, "AwayTeamId"::text FROM "Fixtures" WHERE "_id" = $1`, fixtureID).Scan(&home, &away)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", false, nil
	}
	if err != nil {
		return "", "", false, err
	}
	return deref(home), deref(away), true, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
