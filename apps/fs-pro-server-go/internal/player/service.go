package player

import (
	"context"

	"fs-pro-server/internal/db"
)

// statSortColumns maps the contract's sortBy keys to SQL aggregate
// expressions, mirroring player.service.ts's STAT_SORT_COLUMNS.
var statSortColumns = map[string]string{
	"goals":        `sum(d."Goals")`,
	"saves":        `sum(d."Saves")`,
	"passes":       `sum(d."Passes")`,
	"tackles":      `sum(d."Tackles")`,
	"assists":      `sum(d."Assists")`,
	"clean_sheets": `sum(d."CleanSheets")`,
	"dribbles":     `sum(d."Dribbles")`,
	"points":       `avg(d."Points")`,
	"form":         `avg(d."Form")`,
}

// PlayerStatSortKeys is the allowlisted sortBy set.
var PlayerStatSortKeys = map[string]bool{
	"goals": true, "saves": true, "passes": true, "tackles": true,
	"assists": true, "clean_sheets": true, "dribbles": true,
	"points": true, "form": true,
}

// GetSpecificPlayerStats mirrors getSpecificPlayerStats: aggregate match stats
// per player (optionally scoped to a competition), sorted, with the nested
// `player` object attached. Output shape is the PlayerStatsEntry schema.
// hasCompetition mirrors Node's `competitionCode !== undefined`: an explicitly
// empty value still filters (`= ”`).
func GetSpecificPlayerStats(ctx context.Context, r *Repository, competitionCode string, hasCompetition bool, sortBy, sortDir string) ([]map[string]any, error) {
	sortColumn, ok := statSortColumns[sortBy]
	if !ok {
		sortColumn = statSortColumns["points"]
	}
	direction := "DESC"
	if sortDir == "asc" {
		direction = "ASC"
	}

	sql := `SELECT d."PlayerId"::text AS player_id,
		sum(d."Goals")::float8 AS goals,
		sum(d."Saves")::float8 AS saves,
		sum(d."Passes")::float8 AS passes,
		sum(d."Tackles")::float8 AS tackles,
		sum(d."Assists")::float8 AS assists,
		sum(d."CleanSheets")::float8 AS clean_sheets,
		sum(d."Dribbles")::float8 AS dribbles,
		avg(d."Points")::float8 AS points,
		avg(d."Form")::float8 AS form
	FROM "PlayerMatchDetails" d
	JOIN "Fixtures" f ON d."FixtureId" = f."_id"
	JOIN "Seasons" s ON f."SeasonId" = s."_id"`
	args := []any{}
	if hasCompetition {
		args = append(args, competitionCode)
		sql += ` WHERE s."CompetitionCode" = $1`
	}
	sql += ` GROUP BY d."PlayerId" ORDER BY ` + sortColumn + ` ` + direction

	rows, err := r.q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	grouped, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	return r.attachPlayers(ctx, grouped)
}

// attachPlayers replaces `player_id` with an `_id` stats row plus a nested
// `player` object (with Nationality), mirroring attachPlayersAndFixtures.
func (r *Repository) attachPlayers(ctx context.Context, rows []map[string]any) ([]map[string]any, error) {
	playerIDs := make([]string, 0, len(rows))
	seen := map[string]bool{}
	for _, row := range rows {
		id := db.StringField(row, "player_id")
		if id != "" && !seen[id] {
			seen[id] = true
			playerIDs = append(playerIDs, id)
		}
	}
	players, err := r.byIDs(ctx, playerIDs, true)
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		id := db.StringField(row, "player_id")
		entry := map[string]any{
			"_id":          id,
			"goals":        num(row["goals"]),
			"saves":        num(row["saves"]),
			"passes":       num(row["passes"]),
			"tackles":      num(row["tackles"]),
			"assists":      num(row["assists"]),
			"clean_sheets": num(row["clean_sheets"]),
			"dribbles":     num(row["dribbles"]),
			"points":       num(row["points"]),
			"form":         num(row["form"]),
		}
		if p := players[id]; p != nil {
			// Node's raw-SQL stats path uses lowercase `nationality`; other
			// player reads use `Nationality`. Match the stats key here.
			if nat, ok := p["Nationality"]; ok {
				p["nationality"] = nat
				delete(p, "Nationality")
			}
			entry["player"] = p
		}
		out = append(out, entry)
	}
	return out, nil
}

func (r *Repository) byIDs(ctx context.Context, ids []string, withNationality bool) (map[string]map[string]any, error) {
	out := map[string]map[string]any{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := r.q.Query(ctx, `SELECT * FROM "Players" WHERE "_id"::text = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	if withNationality {
		if err := r.injectNationality(ctx, list); err != nil {
			return nil, err
		}
	}
	for _, p := range list {
		out[db.StringField(p, "_id")] = p
	}
	return out, nil
}
