// Package openplay implements the editions.*, challenges.* and
// competition-definitions.* routes. editions.list, competitionDefinitions
// list/get/validate and the definition validator are real; the edition-entry,
// ranking/bracket, challenge and definition-write endpoints are declared stubs.
package openplay

import (
	"context"
	"sort"
	"strconv"

	"fs-pro-server/internal/db"
)

// Repository reads competitions and editions (Seasons).
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// Q exposes the querier for access checks.
func (r *Repository) Q() db.Querier { return r.q }

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

// Edition returns one season row (an open-play edition), trimmed.
func (r *Repository) Edition(ctx context.Context, id string) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Seasons" WHERE "_id" = $1 LIMIT 1`, id)
	if err != nil {
		return nil, false, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return nil, false, err
	}
	db.Omit(m, unmodelled...)
	return m, true, nil
}

// EditionEntries returns the edition's entries joined to club name/code, by Seed.
func (r *Repository) EditionEntries(ctx context.Context, seasonID string) ([]map[string]any, error) {
	rows, err := r.q.Query(ctx, `SELECT e.*, c."Name" AS "clubName", c."ClubCode" AS "clubCode"
		FROM "Entries" e JOIN "Clubs" c ON c."_id" = e."ClubId"
		WHERE e."SeasonId" = $1 ORDER BY e."Seed" NULLS LAST`, seasonID)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

// ClubEntries returns a club's entries with their edition and competition name.
func (r *Repository) ClubEntries(ctx context.Context, clubID string) ([]map[string]any, error) {
	rows, err := r.q.Query(ctx, `SELECT e."SeasonId", e."ClubId", e."Status" AS "entryStatus", e."Seed", e."Group",
		e."Division", e."FeePaid", e."EliminatedAtStage", e."FinalPosition", e."FinishScore",
		s."SeasonCode", s."CompetitionId", s."Title", s."EditionNumber", s."Status" AS "editionStatus",
		s."Definition", s."RegistrationOpensDay", s."RegistrationClosesDay", s."StartDay",
		s."EndDay", s."CurrentStage", s."StageStartedDay", s."WinnerId", comp."Name" AS "competitionName"
		FROM "Entries" e
		JOIN "Seasons" s ON s."_id" = e."SeasonId"
		JOIN "Competitions" comp ON comp."_id" = s."CompetitionId"
		WHERE e."ClubId" = $1 ORDER BY s."StartDay" DESC`, clubID)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

// ClubPolicy reads a club's EntryPolicy or ChallengePolicy column.
func (r *Repository) ClubPolicy(ctx context.Context, clubID, column string) (any, bool, error) {
	rows, err := r.q.Query(ctx, `SELECT "`+column+`" FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
	if err != nil {
		return nil, false, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return nil, false, err
	}
	return m[column], true, nil
}

// SetClubPolicy writes a club's EntryPolicy or ChallengePolicy column.
func (r *Repository) SetClubPolicy(ctx context.Context, clubID, column string, policy any) error {
	_, err := r.q.Exec(ctx, `UPDATE "Clubs" SET "`+column+`" = $2, "updatedAt" = now() WHERE "_id" = $1`, clubID, policy)
	return err
}

// ChallengesForEdition returns an edition's challenges, newest first.
func (r *Repository) ChallengesForEdition(ctx context.Context, editionID string) ([]map[string]any, error) {
	rows, err := r.q.Query(ctx, `SELECT f.*, comp."Name" AS "competitionName"
		FROM "Fixtures" f LEFT JOIN "Competitions" comp ON comp."_id" = f."CompetitionId"
		WHERE f."SeasonId" = $1 AND f."ChallengeStatus" IS NOT NULL
		ORDER BY f."createdAt" DESC LIMIT 300`, editionID)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

// ChallengesForClub returns a club's challenges (either side), newest first.
func (r *Repository) ChallengesForClub(ctx context.Context, clubID string, statuses []string) ([]map[string]any, error) {
	sql := `SELECT f.*, comp."Name" AS "competitionName"
		FROM "Fixtures" f LEFT JOIN "Competitions" comp ON comp."_id" = f."CompetitionId"
		WHERE (f."HomeTeamId" = $1 OR f."AwayTeamId" = $1 OR f."ChallengerClubId" = $1)
		  AND f."ChallengeStatus" IS NOT NULL`
	args := []any{clubID}
	if len(statuses) > 0 {
		args = append(args, statuses)
		sql += ` AND f."ChallengeStatus" = ANY($2)`
	}
	sql += ` ORDER BY f."createdAt" DESC LIMIT 300`
	rows, err := r.q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

// RankingsTable builds the StageTable shape for GET /editions/{id}/rankings:
// every group's ranked rows for one stage, with pool metadata.
func (r *Repository) RankingsTable(ctx context.Context, seasonID string, stage int, group string) (map[string]any, error) {
	season, ok, err := r.Edition(ctx, seasonID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errString("Edition not found")
	}
	rules := resolveLeagueRules(stageList(season["Definition"]), stage, r.worldDefaultRules(ctx))

	sql := `SELECT * FROM "Rankings" WHERE "SeasonId" = $1 AND "StageIndex" = $2`
	args := []any{seasonID, stage}
	if group != "" {
		args = append(args, group)
		sql += ` AND "Group" = $3`
	}
	rows, err := r.q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	rankingRows, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}

	pools, err := r.pools(ctx, seasonID)
	if err != nil {
		return nil, err
	}
	byGroup := map[string][]map[string]any{}
	order := []string{}
	for _, row := range rankingRows {
		g := db.StringField(row, "Group")
		if _, seen := byGroup[g]; !seen {
			order = append(order, g)
		}
		byGroup[g] = append(byGroup[g], row)
	}
	// Pools in pyramid order (division, then number).
	sort.SliceStable(order, func(i, j int) bool {
		pi, pj := pools[order[i]], pools[order[j]]
		if pi == nil || pj == nil {
			return order[i] < order[j]
		}
		di, dj := intVal(pi["Division"]), intVal(pj["Division"])
		if di != dj {
			return di < dj
		}
		return intVal(pi["Number"]) < intVal(pj["Number"])
	})

	groups := make([]any, 0, len(order))
	for _, g := range order {
		ranked := rankRankingRows(byGroup[g], rules)
		rowsOut := make([]any, 0, len(ranked))
		for _, rr := range ranked {
			rowsOut = append(rowsOut, rr)
		}
		entry := map[string]any{"group": nilIfEmpty(g), "rows": rowsOut}
		if p := pools[g]; p != nil {
			entry["name"] = db.StringField(p, "Name")
			entry["division"] = intVal(p["Division"])
			entry["kickoffHour"] = intVal(p["KickoffHour"])
			entry["metric"] = rules.metric
			entry["minGamesToRank"] = rules.minGamesToRank
		}
		groups = append(groups, entry)
	}
	return map[string]any{
		"seasonId":       seasonID,
		"stageIndex":     stage,
		"metric":         rules.metric,
		"tiebreakers":    rules.tiebreakers,
		"minGamesToRank": rules.minGamesToRank,
		"groups":         groups,
	}, nil
}

func (r *Repository) pools(ctx context.Context, seasonID string) (map[string]map[string]any, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Pools" WHERE "SeasonId" = $1`, seasonID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := map[string]map[string]any{}
	for _, p := range list {
		out[db.StringField(p, "_id")] = p
	}
	return out, nil
}

func (r *Repository) worldDefaultRules(ctx context.Context) map[string]any {
	rows, err := r.q.Query(ctx, `SELECT "DefaultRules" FROM "Calendars" LIMIT 1`)
	if err != nil {
		return nil
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return nil
	}
	rules, _ := m["DefaultRules"].(map[string]any)
	return rules
}

type leagueRules struct {
	metric         string
	tiebreakers    []string
	minGamesToRank int
}

func stageList(definition any) []map[string]any {
	def, ok := definition.(map[string]any)
	if !ok {
		return nil
	}
	raw, ok := def["Stages"].([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		if m, ok := item.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func resolveLeagueRules(stages []map[string]any, stageIndex int, worldDefaults map[string]any) leagueRules {
	rules := leagueRules{metric: "ppg", tiebreakers: []string{"gd", "gf", "wins"}, minGamesToRank: 10}
	apply := func(src map[string]any) {
		if src == nil {
			return
		}
		if v := db.StringField(src, "metric"); v != "" {
			rules.metric = v
		}
		if list, ok := src["tiebreakers"].([]any); ok {
			tb := make([]string, 0, len(list))
			for _, item := range list {
				if s, ok := item.(string); ok {
					tb = append(tb, s)
				}
			}
			if len(tb) > 0 {
				rules.tiebreakers = tb
			}
		}
		if n := intVal(src["minGamesToRank"]); n > 0 {
			rules.minGamesToRank = n
		}
	}
	apply(worldDefaults)
	if stageIndex >= 0 && stageIndex < len(stages) {
		if sr, ok := stages[stageIndex]["rules"].(map[string]any); ok {
			apply(sr)
		}
	}
	return rules
}

func rankRankingRows(rows []map[string]any, rules leagueRules) []map[string]any {
	keys := append([]string{rules.metric}, rules.tiebreakers...)
	metricValue := func(row map[string]any, metric string) float64 {
		switch metric {
		case "points":
			return numVal(row["Points"])
		case "ppg":
			if p := numVal(row["Played"]); p != 0 {
				return numVal(row["Points"]) / p
			}
			return 0
		case "wins":
			return numVal(row["Wins"])
		case "win-rate":
			if p := numVal(row["Played"]); p != 0 {
				return numVal(row["Wins"]) / p
			}
			return 0
		case "gd":
			return numVal(row["GD"])
		case "gf":
			return numVal(row["GF"])
		case "ga-low":
			return -numVal(row["GA"])
		case "clean-sheets":
			return numVal(row["CleanSheets"])
		case "unbeaten-run":
			return numVal(row["BestUnbeatenRun"])
		case "played":
			return numVal(row["Played"])
		default:
			return 0
		}
	}
	less := func(a, b map[string]any) bool {
		for _, key := range keys {
			av, bv := metricValue(a, key), metricValue(b, key)
			if d := bv - av; d > 1e-9 || d < -1e-9 {
				return bv < av
			}
		}
		ap, bp := intVal(a["Played"]), intVal(b["Played"])
		if ap != bp {
			return bp < ap
		}
		return db.StringField(a, "ClubId") < db.StringField(b, "ClubId")
	}
	var ranked, unranked []map[string]any
	for _, row := range rows {
		if intVal(row["Played"]) >= rules.minGamesToRank {
			ranked = append(ranked, row)
		} else {
			unranked = append(unranked, row)
		}
	}
	sortRows(ranked, less)
	sortRows(unranked, less)
	out := make([]map[string]any, 0, len(rows))
	for i, row := range ranked {
		out = append(out, rankingRowOut(row, i+1, 0))
	}
	for _, row := range unranked {
		out = append(out, rankingRowOut(row, -1, rules.minGamesToRank-intVal(row["Played"])))
	}
	return out
}

func rankingRowOut(row map[string]any, rank, gamesNeeded int) map[string]any {
	var rankVal any
	if rank > 0 {
		rankVal = rank
	}
	return map[string]any{
		"clubId":          db.StringField(row, "ClubId"),
		"rank":            rankVal,
		"gamesNeeded":     gamesNeeded,
		"played":          intVal(row["Played"]),
		"wins":            intVal(row["Wins"]),
		"draws":           intVal(row["Draws"]),
		"losses":          intVal(row["Losses"]),
		"gf":              intVal(row["GF"]),
		"ga":              intVal(row["GA"]),
		"gd":              intVal(row["GD"]),
		"points":          intVal(row["Points"]),
		"cleanSheets":     intVal(row["CleanSheets"]),
		"forfeits":        intVal(row["Forfeits"]),
		"bestUnbeatenRun": intVal(row["BestUnbeatenRun"]),
	}
}

func numVal(v any) float64 {
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

func sortRows(rows []map[string]any, less func(a, b map[string]any) bool) {
	for i := 1; i < len(rows); i++ {
		for j := i; j > 0 && less(rows[j], rows[j-1]); j-- {
			rows[j], rows[j-1] = rows[j-1], rows[j]
		}
	}
}

type errString string

func (e errString) Error() string { return string(e) }

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
