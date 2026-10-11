package openplay

import (
	"context"
	"fmt"
	"sort"

	"fs-pro-server/internal/db"
)

// Bracket ports knockout.service.ts getBracket: the rounds drawn so far for a
// knockout stage (current stage by default).

// Bracket is GET /api/editions/{id}/bracket.
func (r *Repository) Bracket(ctx context.Context, seasonID string, stageIndex *int) (map[string]any, error) {
	season, err := seasonRow(ctx, r.q, seasonID)
	if err != nil {
		return nil, err
	}
	index := intVal(season["CurrentStage"])
	if stageIndex != nil {
		index = *stageIndex
	} else {
		stages := toMapList(mapOf(season["Definition"])["Stages"])
		for i, s := range stages {
			if db.StringField(s, "type") == "knockout" {
				index = i
				break
			}
		}
	}

	rows, err := r.q.Query(ctx, `SELECT * FROM "Fixtures"
		WHERE "SeasonId" = $1 AND "StageIndex" = $2 AND "Round" IS NOT NULL
		ORDER BY "Round", "Leg"`, seasonID, index)
	if err != nil {
		return nil, err
	}
	fixtures, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}

	sideIDs := []string{}
	for _, f := range fixtures {
		for _, key := range []string{"HomeSideDetailsId", "AwaySideDetailsId"} {
			if id := db.StringField(f, key); id != "" {
				sideIDs = append(sideIDs, id)
			}
		}
	}
	goals := map[string]int{}
	if len(sideIDs) > 0 {
		sideRows, err := r.q.Query(ctx, `SELECT "_id","Goals" FROM "ClubMatchDetails" WHERE "_id" = ANY($1)`, sideIDs)
		if err != nil {
			return nil, err
		}
		sides, err := db.ScanAll(sideRows)
		if err != nil {
			return nil, err
		}
		for _, s := range sides {
			goals[db.StringField(s, "_id")] = intVal(s["Goals"])
		}
	}
	sideGoals := func(f map[string]any, key string) any {
		if !boolVal(f["Played"]) {
			return nil
		}
		id := db.StringField(f, key)
		if id == "" {
			return 0
		}
		if g, ok := goals[id]; ok {
			return g
		}
		return 0
	}

	byes := map[int]string{}
	for _, l := range toMapList(season["Logs"]) {
		if db.StringField(l, "title") == "Bye" && intVal(l["stageIndex"]) == index {
			if cid := db.StringField(l, "clubId"); cid != "" {
				byes[intVal(l["round"])] = cid
			}
		}
	}

	roundsOrder := []int{}
	roundFixtures := map[int][]map[string]any{}
	for _, f := range fixtures {
		round := intVal(f["Round"])
		if _, seen := roundFixtures[round]; !seen {
			roundsOrder = append(roundsOrder, round)
		}
		roundFixtures[round] = append(roundFixtures[round], f)
	}
	sort.Ints(roundsOrder)

	rounds := make([]any, 0, len(roundsOrder))
	for _, round := range roundsOrder {
		ties := []any{}
		for _, legs := range tiesOf(roundFixtures[round]) {
			last := legs[len(legs)-1]
			tie := mapOf(mapOf(last["Details"])["Tie"])
			legOut := make([]any, 0, len(legs))
			for _, l := range legs {
				legOut = append(legOut, map[string]any{
					"fixtureId":    db.StringField(l, "_id"),
					"leg":          intOrNilDefault(l["Leg"], 1),
					"homeClubId":   db.StringField(l, "HomeTeamId"),
					"awayClubId":   db.StringField(l, "AwayTeamId"),
					"scheduledDay": l["ScheduledDay"],
					"played":       boolVal(l["Played"]),
					"homeGoals":    sideGoals(l, "HomeSideDetailsId"),
					"awayGoals":    sideGoals(l, "AwaySideDetailsId"),
				})
			}
			var winner, decided any
			if tie != nil {
				winner = nilIfEmpty(db.StringField(tie, "winnerId"))
				decided = nilIfEmpty(db.StringField(tie, "decidedBy"))
			}
			ties = append(ties, map[string]any{
				"highSeedClubId": db.StringField(last, "HomeTeamId"),
				"lowSeedClubId":  db.StringField(last, "AwayTeamId"),
				"playBy":         legs[0]["PlayBy"],
				"legs":           legOut,
				"winnerId":       winner,
				"decidedBy":      decided,
			})
		}
		var bye any
		if cid, ok := byes[round]; ok {
			bye = cid
		}
		rounds = append(rounds, map[string]any{"round": round, "ties": ties, "byeClubId": bye})
	}

	return map[string]any{"seasonId": seasonID, "stageIndex": index, "rounds": rounds}, nil
}

// tiesOf groups a round's fixtures into ties keyed by the unordered pairing,
// legs ordered by Leg.
func tiesOf(roundFixtures []map[string]any) [][]map[string]any {
	order := []string{}
	byKey := map[string][]map[string]any{}
	for _, f := range roundFixtures {
		home := db.StringField(f, "HomeTeamId")
		away := db.StringField(f, "AwayTeamId")
		key := home + "|" + away
		if away < home {
			key = away + "|" + home
		}
		if _, seen := byKey[key]; !seen {
			order = append(order, key)
		}
		byKey[key] = append(byKey[key], f)
	}
	out := make([][]map[string]any, 0, len(order))
	for _, key := range order {
		legs := byKey[key]
		sort.SliceStable(legs, func(i, j int) bool { return intOrNilDefault(legs[i]["Leg"], 1) < intOrNilDefault(legs[j]["Leg"], 1) })
		out = append(out, legs)
	}
	return out
}

func intOrNilDefault(v any, fallback int) int {
	if v == nil {
		return fallback
	}
	return intVal(v)
}

func editionNotFound(id string) error {
	return fmt.Errorf("Edition %s not found", id)
}
