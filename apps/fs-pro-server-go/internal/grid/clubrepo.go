package grid

import (
	"context"

	"fs-pro-server/internal/auth"
	"fs-pro-server/internal/db"
)

// ClubProfile is the coarse club view the grid and scout screens may show:
// identity, the Clubhouse tier that gates columns, and the Standing bucket that
// names the ladder league. It deliberately carries no squad detail.
type ClubProfile struct {
	ID             string
	Name           string
	Code           string
	Rating         float64
	ClubhouseTier  int
	StandingPoints int
}

// ClubReader resolves the club fields the grid routes need. found is false when
// the club does not exist.
type ClubReader interface {
	Profile(ctx context.Context, clubID string) (ClubProfile, bool, error)
	// ClubForUser returns a club owned by userID (the grid editor's club), or
	// found=false when the user owns none.
	ClubForUser(ctx context.Context, userID string) (clubID string, found bool, err error)
}

// Ownership authorises a mutation against a club the route policy did not scope
// (grid.importLayout is SignedIn, not a club-param rule).
type Ownership interface {
	// CanManage returns (0, "") when userID may manage clubID, else an HTTP
	// status (401/403/404) and a client message.
	CanManage(ctx context.Context, userID, clubID string) (status int, message string)
}

// PgClubReader reads Clubs. ClubhouseTier and StandingPoints are added by the
// additive migration 0045_campus_core.sql (docs/coc-mapping/05 §8), so a DB test
// skips cleanly until the schema carries them.
type PgClubReader struct {
	q db.Querier
}

// NewPgClubReader wraps a Querier.
func NewPgClubReader(q db.Querier) *PgClubReader { return &PgClubReader{q: q} }

// Profile reads one club's public profile.
func (r *PgClubReader) Profile(ctx context.Context, clubID string) (ClubProfile, bool, error) {
	rows, err := r.q.Query(ctx, `SELECT "_id", "Name", "ClubCode", "Rating", "ClubhouseTier", "StandingPoints"
		FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
	if err != nil {
		return ClubProfile{}, false, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return ClubProfile{}, false, err
	}
	return ClubProfile{
		ID:             db.StringField(m, "_id"),
		Name:           db.StringField(m, "Name"),
		Code:           db.StringField(m, "ClubCode"),
		Rating:         ratingOf(m["Rating"]),
		ClubhouseTier:  intField(m["ClubhouseTier"]),
		StandingPoints: intField(m["StandingPoints"]),
	}, true, nil
}

// ClubForUser returns a club owned by userID (the oldest non-released one), used
// to scope grid import when the request omits the target club.
func (r *PgClubReader) ClubForUser(ctx context.Context, userID string) (string, bool, error) {
	if userID == "" {
		return "", false, nil
	}
	rows, err := r.q.Query(ctx, `SELECT "_id" FROM "Clubs"
		WHERE "UserId" = $1 AND "ReleasedAt" IS NULL
		ORDER BY "createdAt" NULLS LAST, "_id" LIMIT 1`, userID)
	if err != nil {
		return "", false, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return "", false, err
	}
	return db.StringField(m, "_id"), true, nil
}

// PgOwnership authorises grid mutations via auth.CanManageClub, mirroring the
// route policy's ownership check.
type PgOwnership struct {
	q db.Querier
}

// NewPgOwnership wraps a Querier.
func NewPgOwnership(q db.Querier) *PgOwnership { return &PgOwnership{q: q} }

// CanManage reports whether userID owns clubID (or is an admin), else why not.
func (o *PgOwnership) CanManage(ctx context.Context, userID, clubID string) (int, string) {
	return auth.CanManageClub(ctx, o.q, userID, clubID)
}

func ratingOf(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int32:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return 0
	}
}

func intField(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int32:
		return int(n)
	case int64:
		return int(n)
	case float64:
		return int(n)
	case float32:
		return int(n)
	default:
		return 0
	}
}
