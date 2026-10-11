package play

import (
	"context"
	"encoding/json"
	"fmt"

	"fs-pro-server/internal/clients"
	"fs-pro-server/internal/db"
)

// PlayFixture ports game.controller.ts play(): run an existing fixture through
// the engine and persist the result (gate + form), optionally recording the
// replay. PLAY rewards are the playMatch layer's job, not this one.

func (r *Repository) PlayFixture(ctx context.Context, fixtureID string, headless bool) (map[string]any, error) {
	if fixtureID == "" {
		return nil, fmt.Errorf("No Fixture ID sent! ")
	}
	fixture, ok, err := r.one(ctx, `SELECT * FROM "Fixtures" WHERE "_id" = $1`, fixtureID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("Fixture not found [f =>%s ]", fixtureID)
	}
	homeID, awayID := db.StringField(fixture, "HomeTeamId"), db.StringField(fixture, "AwayTeamId")
	home, _, _ := r.one(ctx, `SELECT * FROM "Clubs" WHERE "_id" = $1`, homeID)
	away, _, _ := r.one(ctx, `SELECT * FROM "Clubs" WHERE "_id" = $1`, awayID)
	if home == nil || away == nil {
		return nil, fmt.Errorf("Fixture not found [f =>%s ]", fixtureID)
	}
	homeTactic := tacticOr(parseSideTactic(fixture["HomeTactic"]), home)
	awayTactic := tacticOr(parseSideTactic(fixture["AwayTactic"]), away)

	request, err := r.buildSimRequestWithTactics(ctx, fixtureID, homeID, awayID, home, away, homeTactic, awayTactic, !headless)
	if err != nil {
		return nil, err
	}
	if ft := db.StringField(fixture, "Type"); ft != "" {
		request["fixtureType"] = ft
	}
	if st := db.StringField(fixture, "Stage"); st != "" {
		request["stage"] = st
	}
	matchData, err := clients.SimulateMatch(ctx, request)
	if err != nil {
		return nil, err
	}
	details := mapOf(matchData["Details"])
	if details == nil {
		details = map[string]any{}
	}
	homeGoals, awayGoals := intOf(details["HomeTeamScore"]), intOf(details["AwayTeamScore"])
	rawDetails, _ := json.Marshal(details)
	rawEvents, _ := json.Marshal(matchData["Events"])
	homeOutcome := outcomeOf(homeGoals, awayGoals)
	awayOutcome := outcomeOf(awayGoals, homeGoals)
	homeRef := map[string]any{"id": homeID, "name": db.StringField(home, "Name"), "code": db.StringField(home, "ClubCode")}
	awayRef := map[string]any{"id": awayID, "name": db.StringField(away, "Name"), "code": db.StringField(away, "ClubCode")}

	// S2 fix: every write (fixture result, gate, standing, replay) commits in
	// ONE transaction, and the replay is an upsert, so re-kicking a fixture is
	// idempotent instead of failing on the FixtureId unique key.
	var updated map[string]any
	err = db.WithTx(ctx, r.q, func(tx db.Querier) error {
		rx := *r
		rx.q = tx
		rows, err := tx.Query(ctx, `UPDATE "Fixtures" SET "Played" = true, "Details" = $2::jsonb, "Events" = $3::jsonb, "PlayedAt" = now(), "updatedAt" = now() WHERE "_id" = $1 RETURNING *`,
			fixtureID, string(rawDetails), string(rawEvents))
		if err != nil {
			return err
		}
		m, ok, err := db.ScanOne(rows)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("Fixture not found [f =>%s ]", fixtureID)
		}
		updated = m
		if _, err := rx.applyGate(ctx, home, homeGoals, awayGoals); err != nil {
			return err
		}
		if err := rx.applyStanding(ctx, home, homeOutcome); err != nil {
			return err
		}
		if err := rx.applyStanding(ctx, away, awayOutcome); err != nil {
			return err
		}
		if headless {
			return nil
		}
		_, err = tx.Exec(ctx, `INSERT INTO "MatchReplays" ("FixtureId","Home","Away","Frames","Details","TickMs","updatedAt")
			VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6,now())
			ON CONFLICT ("FixtureId") DO UPDATE SET "Home" = EXCLUDED."Home", "Away" = EXCLUDED."Away",
			  "Frames" = EXCLUDED."Frames", "Details" = EXCLUDED."Details", "TickMs" = EXCLUDED."TickMs", "updatedAt" = now()`,
			fixtureID, jsonArg(homeRef), jsonArg(awayRef), jsonArg(matchData["Frames"]), jsonArg(details), 300)
		return err
	})
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"match":             updated,
		"HomeSideDetails":   matchData["Home"],
		"AwaySideDetails":   matchData["Away"],
		"lastMatchOfSeason": false,
	}, nil
}

func jsonArg(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func outcomeOf(yours, theirs int) string {
	if yours > theirs {
		return "win"
	}
	if yours < theirs {
		return "loss"
	}
	return "draw"
}
