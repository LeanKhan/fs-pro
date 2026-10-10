// Package play implements the play.* routes: the club's play state, matchday,
// inbox, matchmaking preview and the PLAY gate. Sim-core-dependent endpoints
// (playMatch after the gate, match prep/preview, shop) are declared stubs.
package play

import (
	"context"
	"time"

	"fs-pro-server/internal/db"
)

// Repository reads the club state play needs.
type Repository struct {
	q db.Querier
	// simulate runs one match through sim-service. It is a field so tests can
	// inject a deterministic fake; production uses clients.SimulateMatch.
	simulate func(ctx context.Context, request map[string]any) (map[string]any, error)
	// notifier delivers a resolved raid to the defender. The default writes a
	// durable ClubMessages row; a realtime transport can be wired in later
	// (docs/coc-mapping/08 §4, P7/P10).
	notifier Notifier
	// now is the clock. It is a field so tests can pin resolution timestamps.
	now func() time.Time
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository {
	return &Repository{q: q, simulate: defaultSimulator(), notifier: ClubMessageNotifier{}, now: time.Now}
}

// Q exposes the querier for access checks.
func (r *Repository) Q() db.Querier { return r.q }

// Club returns the play-relevant club fields.
func (r *Repository) Club(ctx context.Context, clubID string) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `SELECT "_id","Name","ClubCode","Rating","XP","Budget","UserId","ManagerId",
		"Fans","Reputation","BoardConfidence","Form","ShieldUntil","ReleasedAt","Lineup"
		FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

// LevelThresholds returns Calendars.LevelThresholds (jsonb array of numbers).
func (r *Repository) LevelThresholds(ctx context.Context) []float64 {
	rows, err := r.q.Query(ctx, `SELECT "LevelThresholds" FROM "Calendars" LIMIT 1`)
	if err != nil {
		return nil
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return nil
	}
	out := []float64{}
	if list, ok := m["LevelThresholds"].([]any); ok {
		for _, v := range list {
			out = append(out, floatOf(v))
		}
	}
	return out
}

// RecentMatchmade returns the club's last few matchmade (Title-marked) results.
func (r *Repository) RecentMatchmade(ctx context.Context, clubID string, limit int) ([]map[string]any, error) {
	rows, err := r.q.Query(ctx, `SELECT "_id","AwayTeamId","PlayedAt","updatedAt","Details"
		FROM "Fixtures" WHERE "HomeTeamId" = $1 AND "Played" = true AND "Title" LIKE '%(Matchmade)%'
		ORDER BY "PlayedAt" DESC LIMIT $2`, clubID, limit)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

// LastMatchmadePlayedAt returns the club's most recent matchmade result time.
func (r *Repository) LastMatchmadePlayedAt(ctx context.Context, clubID string) (string, error) {
	rows, err := r.q.Query(ctx, `SELECT "PlayedAt" FROM "Fixtures"
		WHERE "HomeTeamId" = $1 AND "Played" = true AND "Title" LIKE '%(Matchmade)%'
		ORDER BY "PlayedAt" DESC LIMIT 1`, clubID)
	if err != nil {
		return "", err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return "", err
	}
	return db.StringField(m, "PlayedAt"), nil
}

// Opponents returns up to `limit` closest-power clubs (never the caller's own,
// never released or shielded), with the human manager's name when known.
func (r *Repository) Opponents(ctx context.Context, clubID string, rating float64, limit int) ([]map[string]any, error) {
	rows, err := r.q.Query(ctx, `SELECT c."_id", c."Name", c."ClubCode", c."Rating", c."UserId", u."FullName" AS manager
		FROM "Clubs" c LEFT JOIN "Users" u ON u."_id" = c."UserId"
		WHERE c."_id" <> $1 AND c."ReleasedAt" IS NULL
		  AND (c."ShieldUntil" IS NULL OR c."ShieldUntil" < now())
		ORDER BY abs(c."Rating" - $2), c."_id" LIMIT $3`, clubID, rating, limit)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

// FixturesForClub returns the club's fixtures (home or away), newest first.
func (r *Repository) FixturesForClub(ctx context.Context, clubID string, played bool) ([]map[string]any, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Fixtures"
		WHERE ("HomeTeamId" = $1 OR "AwayTeamId" = $1) AND "Played" = $2
		ORDER BY "ScheduledDay" DESC NULLS LAST, "PlayedAt" DESC NULLS LAST LIMIT 20`, clubID, played)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

// Messages returns the club's inbox, newest first.
func (r *Repository) Messages(ctx context.Context, clubID string) ([]map[string]any, error) {
	rows, err := r.q.Query(ctx, `SELECT "_id","Kind","Tone","Title","Body","Read","createdAt"
		FROM "ClubMessages" WHERE "ClubId" = $1 ORDER BY "createdAt" DESC LIMIT 100`, clubID)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

// MarkMessagesRead marks every message read.
func (r *Repository) MarkMessagesRead(ctx context.Context, clubID string) error {
	_, err := r.q.Exec(ctx, `UPDATE "ClubMessages" SET "Read" = true, "updatedAt" = now() WHERE "ClubId" = $1`, clubID)
	return err
}

// ClubNames resolves a set of club ids to Name/ClubCode/Rating.
func (r *Repository) ClubNames(ctx context.Context, ids []string) (map[string]map[string]any, error) {
	out := map[string]map[string]any{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := r.q.Query(ctx, `SELECT "_id","Name","ClubCode","Rating" FROM "Clubs" WHERE "_id"::text = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	for _, m := range list {
		out[db.StringField(m, "_id")] = m
	}
	return out, nil
}

// SquadCounts returns signed, non-retired squad size and goalkeeper count.
func (r *Repository) SquadCounts(ctx context.Context, clubID string) (total, gk int, err error) {
	rows, err := r.q.Query(ctx, `SELECT count(*)::int AS total,
		count(*) FILTER (WHERE "Position" = 'GK')::int AS gk
		FROM "Players" WHERE "ClubId" = $1 AND "isSigned" = true AND "isRetired" = false`, clubID)
	if err != nil {
		return 0, 0, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return 0, 0, err
	}
	return intOf(m["total"]), intOf(m["gk"]), nil
}
