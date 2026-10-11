package game

import (
	"context"

	"fs-pro-server/internal/db"
)

// Match-replay reads, ported from controllers/match-replays/match-replay.service.ts.

func fetchReplay(ctx context.Context, q db.Querier, fixtureID string) (map[string]any, error) {
	rows, err := q.Query(ctx, `SELECT * FROM "MatchReplays" WHERE "FixtureId" = $1 LIMIT 1`, fixtureID)
	if err != nil {
		return nil, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return nil, err
	}
	return m, nil
}

// replayPlayerNames maps everyone in a replay's frames to "F. Lastname".
func replayPlayerNames(ctx context.Context, q db.Querier, frames any) (map[string]any, error) {
	ids := []string{}
	seen := map[string]bool{}
	add := func(id string) {
		if id != "" && !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	if m, ok := frames.(map[string]any); ok {
		if roster, ok := m["roster"].([]any); ok {
			for _, r := range roster {
				if rm, ok := r.(map[string]any); ok {
					add(db.StringField(rm, "id"))
				}
			}
		}
	} else if arr, ok := frames.([]any); ok {
		for _, f := range arr {
			fm, ok := f.(map[string]any)
			if !ok {
				continue
			}
			if ps, ok := fm["players"].([]any); ok {
				for _, p := range ps {
					if pm, ok := p.(map[string]any); ok {
						add(db.StringField(pm, "id"))
					}
				}
			}
		}
	}
	out := map[string]any{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `SELECT "_id","FirstName","LastName" FROM "Players" WHERE "_id" = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	for _, p := range list {
		first, last := db.StringField(p, "FirstName"), db.StringField(p, "LastName")
		initial := ""
		if r := []rune(first); len(r) > 0 {
			initial = string(r[0])
		}
		out[db.StringField(p, "_id")] = initial + ". " + last
	}
	return out, nil
}
