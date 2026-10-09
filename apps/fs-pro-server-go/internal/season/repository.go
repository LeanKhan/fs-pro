// Package season implements the seasons.* routes over the "Seasons" table.
package season

import (
	"context"

	"fs-pro-server/internal/db"
)

// Filter narrows a season list.
type Filter struct {
	CompetitionID  string
	HasCompetition bool
	SeasonCode     string
	HasSeasonCode  bool
}

// Repository is the pgx-backed Season store.
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// seasonUnmodelled are DB columns absent from Node's Drizzle `seasons` schema;
// fixtureUnmodelled is the same for the nested Fixtures.
var (
	seasonUnmodelled  = []string{"Promoted", "Relegated", "isFinished", "isStarted", "Year", "Standings"}
	fixtureUnmodelled = []string{"Week"}
)

// FindAll returns seasons matching the filter.
func (r *Repository) FindAll(ctx context.Context, f Filter) ([]map[string]any, error) {
	conditions := make([]string, 0, 2)
	args := make([]any, 0, 2)
	if f.HasCompetition {
		args = append(args, f.CompetitionID)
		conditions = append(conditions, `"CompetitionId" = $1`)
	}
	if f.HasSeasonCode {
		args = append(args, f.SeasonCode)
		conditions = append(conditions, `"SeasonCode" = $`+itoa(len(args)))
	}
	sql := `SELECT * FROM "Seasons"`
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
	db.OmitAll(list, seasonUnmodelled...)
	return list, nil
}

// FindByID returns one season with its Fixtures attached (plain rows).
func (r *Repository) FindByID(ctx context.Context, id string) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Seasons" WHERE "_id" = $1 LIMIT 1`, id)
	if err != nil {
		return nil, false, err
	}
	s, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return nil, false, err
	}
	db.Omit(s, seasonUnmodelled...)
	frows, err := r.q.Query(ctx, `SELECT * FROM "Fixtures" WHERE "SeasonId" = $1`, id)
	if err != nil {
		return nil, false, err
	}
	fixtures, err := db.ScanAll(frows)
	if err != nil {
		return nil, false, err
	}
	db.OmitAll(fixtures, fixtureUnmodelled...)
	s["Fixtures"] = fixtures
	return s, true, nil
}

// Delete removes a season, returning ok=false when it doesn't exist.
func (r *Repository) Delete(ctx context.Context, id string) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `DELETE FROM "Seasons" WHERE "_id" = $1 RETURNING *`, id)
	if err != nil {
		return nil, false, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return m, ok, err
	}
	db.Omit(m, seasonUnmodelled...)
	return m, true, nil
}

// clubCodes resolves a set of club ids to their ClubCode.
func (r *Repository) clubCodes(ctx context.Context, ids []string) (map[string]string, error) {
	out := map[string]string{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := r.q.Query(ctx, `SELECT "_id", "ClubCode" FROM "Clubs" WHERE "_id"::text = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	for _, c := range list {
		out[db.StringField(c, "_id")] = db.StringField(c, "ClubCode")
	}
	return out, nil
}
