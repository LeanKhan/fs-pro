// Package openplay implements the editions.*, challenges.* and
// competition-definitions.* routes. editions.list, competitionDefinitions
// list/get/validate and the definition validator are real; the edition-entry,
// ranking/bracket, challenge and definition-write endpoints are declared stubs.
package openplay

import (
	"context"
	"strconv"

	"fs-pro-server/internal/db"
)

// Repository reads competitions and editions (Seasons).
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// Competitions returns competition rows (optionally excluding archived),
// ordered by Name like Node.
func (r *Repository) Competitions(ctx context.Context, includeArchived bool) ([]map[string]any, error) {
	sql := `SELECT * FROM "Competitions"`
	if !includeArchived {
		sql += ` WHERE "Archived" = false`
	}
	sql += ` ORDER BY "Name"`
	rows, err := r.q.Query(ctx, sql)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

// LatestEditions returns the newest edition (by EditionNumber) per competition.
func (r *Repository) LatestEditions(ctx context.Context, competitionIDs []string) (map[string]map[string]any, error) {
	out := map[string]map[string]any{}
	if len(competitionIDs) == 0 {
		return out, nil
	}
	rows, err := r.q.Query(ctx, `SELECT "CompetitionId","_id","SeasonCode","Status","EditionNumber"
		FROM "Seasons" WHERE "CompetitionId"::text = ANY($1)
		ORDER BY "EditionNumber" DESC NULLS LAST`, competitionIDs)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	for _, s := range list {
		id := db.StringField(s, "CompetitionId")
		if _, seen := out[id]; !seen {
			out[id] = s
		}
	}
	return out, nil
}

// Competition returns one competition by id.
func (r *Repository) Competition(ctx context.Context, id string) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Competitions" WHERE "_id" = $1 LIMIT 1`, id)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

// Editions returns season rows (open-play editions) that belong to a
// competition, newest start day first, limit 200 - matching Node's
// open-play.router `list`.
func (r *Repository) Editions(ctx context.Context, status string, competitionID string) ([]map[string]any, error) {
	conditions := []string{`"CompetitionId" IS NOT NULL`}
	args := []any{}
	if status != "" {
		args = append(args, status)
		conditions = append(conditions, `"Status" = $`+itoa(len(args)))
	}
	if competitionID != "" {
		args = append(args, competitionID)
		conditions = append(conditions, `"CompetitionId" = $`+itoa(len(args)))
	}
	sql := `SELECT * FROM "Seasons" WHERE ` + joinAnd(conditions) + ` ORDER BY "StartDay" DESC LIMIT 200`
	rows, err := r.q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	db.OmitAll(list, unmodelled...)
	return list, nil
}

// unmodelled season columns (same drop as the season package).
var unmodelled = []string{"Promoted", "Relegated", "isFinished", "isStarted", "Year", "Standings"}

func itoa(n int) string { return strconv.Itoa(n) }

func joinAnd(conditions []string) string {
	out := ""
	for i, c := range conditions {
		if i > 0 {
			out += " AND "
		}
		out += c
	}
	return out
}
