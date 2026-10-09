package season

import (
	"context"
	"math"
	"sort"

	"fs-pro-server/internal/db"
)

// Standings ports ranking.service.ts's editionStandings: an edition's table as
// one flat list, best first. For a pyramid edition it returns the top
// division's pool group; otherwise the current (or last league/groups) stage.
// Each group is ranked by rankRows' rules and Rank is 1..N within the group;
// Rank is null for clubs under minGamesToRank.
func (r *Repository) Standings(ctx context.Context, seasonID string) ([]map[string]any, error) {
	season, ok, err := r.rawSeasonDefinition(ctx, seasonID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return []map[string]any{}, nil
	}
	stages := stageList(season["Definition"])
	if len(stages) == 0 {
		return []map[string]any{}, nil
	}

	stageIndex := 0
	groupFilter := ""
	hasGroupFilter := false
	if stageType(stages[0]) == "pyramid" {
		pool, found, perr := r.topPool(ctx, seasonID)
		if perr != nil {
			return nil, perr
		}
		if !found {
			return []map[string]any{}, nil
		}
		groupFilter, hasGroupFilter = pool, true
	} else {
		cur := intField(season["CurrentStage"])
		if cur < 0 {
			cur = 0
		}
		if cur > len(stages)-1 {
			cur = len(stages) - 1
		}
		for cur > 0 && stageType(stages[cur]) == "knockout" {
			cur--
		}
		if stageType(stages[cur]) == "knockout" {
			return []map[string]any{}, nil
		}
		stageIndex = cur
	}

	rows, err := r.standingsRows(ctx, seasonID, stageIndex, groupFilter, hasGroupFilter)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return []map[string]any{}, nil
	}

	rules := resolveRules(stages[stageIndex], r.worldDefaultRules(ctx))
	currentElo, err := r.currentElo(ctx, collectClubIDs(rows))
	if err != nil {
		return nil, err
	}

	// Group by Group, rank each, then flatten.
	byGroup := map[string][]map[string]any{}
	order := []string{}
	for _, row := range rows {
		g := dbStr(row["Group"])
		if _, seen := byGroup[g]; !seen {
			order = append(order, g)
		}
		byGroup[g] = append(byGroup[g], row)
	}
	sort.Strings(order)

	type flat struct {
		row   map[string]any
		rank  any
		group any
	}
	flattened := make([]flat, 0, len(rows))
	for _, g := range order {
		ranked, unranked := rankRows(byGroup[g], rules, currentElo)
		for _, rr := range ranked {
			flattened = append(flattened, flat{row: rr.row, rank: rr.rank, group: nullableGroup(g)})
		}
		for _, rr := range unranked {
			flattened = append(flattened, flat{row: rr.row, rank: nil, group: nullableGroup(g)})
		}
	}
	sort.SliceStable(flattened, func(i, j int) bool {
		ri, rj := rankValue(flattened[i].rank), rankValue(flattened[j].rank)
		if (ri == nil) != (rj == nil) {
			return rj == nil
		}
		if ri != nil && *ri != *rj {
			return *ri < *rj
		}
		return dbStr(flattened[i].group) < dbStr(flattened[j].group)
	})

	codes, err := r.clubCodes(ctx, collectClubIDs(rows))
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(flattened))
	for i, f := range flattened {
		clubID := dbStr(f.row["ClubId"])
		out = append(out, map[string]any{
			"ClubID":   clubID,
			"ClubCode": codes[clubID],
			"Position": i + 1,
			"Rank":     f.rank,
			"Group":    f.group,
			"Points":   f.row["Points"],
			"Played":   f.row["Played"],
			"Wins":     f.row["Wins"],
			"Draws":    f.row["Draws"],
			"Losses":   f.row["Losses"],
			"GF":       f.row["GF"],
			"GA":       f.row["GA"],
			"GD":       f.row["GD"],
		})
	}
	return out, nil
}

func (r *Repository) rawSeasonDefinition(ctx context.Context, seasonID string) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `SELECT "Definition", "CurrentStage" FROM "Seasons" WHERE "_id" = $1 LIMIT 1`, seasonID)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

func (r *Repository) topPool(ctx context.Context, seasonID string) (string, bool, error) {
	rows, err := r.q.Query(ctx, `SELECT "_id" FROM "Pools" WHERE "SeasonId" = $1 AND "Division" = 1 ORDER BY "Number" LIMIT 1`, seasonID)
	if err != nil {
		return "", false, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return "", false, err
	}
	return dbStr(m["_id"]), true, nil
}

func (r *Repository) standingsRows(ctx context.Context, seasonID string, stage int, group string, hasGroup bool) ([]map[string]any, error) {
	sql := `SELECT * FROM "Rankings" WHERE "SeasonId" = $1 AND "StageIndex" = $2`
	args := []any{seasonID, stage}
	if hasGroup {
		sql += ` AND "Group" = $3`
		args = append(args, group)
	}
	rows, err := r.q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
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

func (r *Repository) currentElo(ctx context.Context, ids []string) (map[string]float64, error) {
	out := map[string]float64{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := r.q.Query(ctx, `SELECT "_id", "Elo" FROM "Clubs" WHERE "_id"::text = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	for _, c := range list {
		out[dbStr(c["_id"])] = floatField(c["Elo"])
	}
	return out, nil
}

// --- ranking rules ---------------------------------------------------------

type leagueRules struct {
	metric         string
	tiebreakers    []string
	minGamesToRank int
}

// resolveRules mirrors definition.ts's resolveLeagueRules over the world
// defaults: {DEFAULT, ...worldDefaults, ...stage.rules}.
func resolveRules(stage map[string]any, worldDefaults map[string]any) leagueRules {
	rules := leagueRules{metric: "ppg", tiebreakers: []string{"gd", "gf", "wins"}, minGamesToRank: 10}
	apply := func(src map[string]any) {
		if src == nil {
			return
		}
		if v := dbStr(src["metric"]); v != "" {
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
		if n := intField(src["minGamesToRank"]); n > 0 {
			rules.minGamesToRank = n
		}
	}
	apply(worldDefaults)
	if stage != nil {
		if sr, ok := stage["rules"].(map[string]any); ok {
			apply(sr)
		}
	}
	return rules
}

type rankedRow struct {
	row  map[string]any
	rank *int
}

// rankRows mirrors ranking.ts's rankRows: ranked clubs first (Played >=
// minGamesToRank) ordered by metric/tiebreakers desc, then Played desc, then
// ClubId; unranked clubs follow with rank null.
func rankRows(rows []map[string]any, rules leagueRules, currentElo map[string]float64) ([]rankedRow, []rankedRow) {
	keys := append([]string{rules.metric}, rules.tiebreakers...)
	less := func(a, b map[string]any) bool {
		for _, key := range keys {
			av := metricValue(a, key, currentElo)
			bv := metricValue(b, key, currentElo)
			if math.Abs(bv-av) > 1e-9 {
				return bv < av
			}
		}
		ap, bp := intField(a["Played"]), intField(b["Played"])
		if ap != bp {
			return bp < ap
		}
		return dbStr(a["ClubId"]) < dbStr(b["ClubId"])
	}

	var ranked, unranked []map[string]any
	for _, row := range rows {
		if intField(row["Played"]) >= rules.minGamesToRank {
			ranked = append(ranked, row)
		} else {
			unranked = append(unranked, row)
		}
	}
	sort.SliceStable(ranked, func(i, j int) bool { return less(ranked[i], ranked[j]) })
	sort.SliceStable(unranked, func(i, j int) bool { return less(unranked[i], unranked[j]) })

	out := make([]rankedRow, 0, len(rows))
	for i, row := range ranked {
		rank := i + 1
		out = append(out, rankedRow{row: row, rank: &rank})
	}
	for _, row := range unranked {
		out = append(out, rankedRow{row: row, rank: nil})
	}
	// Split back so the caller can keep ranked/unranked ordering.
	return out[:len(ranked)], out[len(ranked):]
}

func metricValue(row map[string]any, metric string, currentElo map[string]float64) float64 {
	switch metric {
	case "points":
		return floatField(row["Points"])
	case "ppg":
		if p := floatField(row["Played"]); p != 0 {
			return floatField(row["Points"]) / p
		}
		return 0
	case "wins":
		return floatField(row["Wins"])
	case "win-rate":
		if p := floatField(row["Played"]); p != 0 {
			return floatField(row["Wins"]) / p
		}
		return 0
	case "gd":
		return floatField(row["GD"])
	case "gf":
		return floatField(row["GF"])
	case "ga-low":
		return -floatField(row["GA"])
	case "clean-sheets":
		return floatField(row["CleanSheets"])
	case "unbeaten-run":
		return floatField(row["BestUnbeatenRun"])
	case "elo-gain":
		start := floatField(row["EloStart"])
		return currentElo[dbStr(row["ClubId"])] - start
	case "played":
		return floatField(row["Played"])
	default:
		return 0
	}
}

// --- helpers ---------------------------------------------------------------

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

func stageType(stage map[string]any) string { return dbStr(stage["type"]) }

func nullableGroup(g string) any {
	if g == "" {
		return nil
	}
	return g
}

func rankValue(v any) *int {
	switch n := v.(type) {
	case int:
		return &n
	case *int:
		return n
	default:
		return nil
	}
}

func collectClubIDs(rows []map[string]any) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, row := range rows {
		id := dbStr(row["ClubId"])
		if id != "" && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

// dbStr reads a string-valued field (values already normalised by db.Scan*).
func dbStr(v any) string {
	s, _ := v.(string)
	return s
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

func floatField(v any) float64 {
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
