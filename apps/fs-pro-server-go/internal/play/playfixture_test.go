package play

import (
	"context"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

// TestPlayFixtureIdempotentRolledBack is the S2 regression: kicking off the
// same fixture twice upserts the replay and returns nil both times, leaving
// exactly one MatchReplays row.
func TestPlayFixtureIdempotentRolledBack(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	pool, err := db.New(context.Background(), url, 15*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()
	ctx := context.Background()

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)
		rows, err := tx.Query(ctx, `SELECT c."_id" AS id, c."Name" AS name, c."ClubCode" AS code FROM "Clubs" c
			WHERE c."ReleasedAt" IS NULL
			  AND (SELECT count(*) FROM "Players" p WHERE p."ClubId" = c."_id" AND p."isSigned" = true AND p."isRetired" = false) >= 11
			ORDER BY c."Rating" DESC LIMIT 2`)
		if err != nil {
			return err
		}
		clubs, err := db.ScanAll(rows)
		if err != nil {
			return err
		}
		if len(clubs) < 2 {
			t.Skip("need two clubs with legal squads")
		}
		fx, err := db.InsertRow(ctx, tx, "Fixtures", map[string]any{
			"Title": "Idempotent FC A vs B", "Home": db.StringField(clubs[0], "code"), "Away": db.StringField(clubs[1], "code"),
			"HomeTeamId": db.StringField(clubs[0], "id"), "AwayTeamId": db.StringField(clubs[1], "id"),
			"Type": "friendly", "Stage": "friendly", "Played": false, "SaveStats": true, "updatedAt": time.Now(),
		})
		if err != nil {
			return err
		}
		fixtureID := db.StringField(fx, "_id")

		if _, err := repo.PlayFixture(ctx, fixtureID, false); err != nil {
			t.Fatalf("first kickoff: %v", err)
		}
		result, err := repo.PlayFixture(ctx, fixtureID, false)
		if err != nil {
			t.Fatalf("second kickoff must succeed (idempotent), got %v", err)
		}
		det := mapOf(mapOf(result["match"])["Details"])
		if mapOf(result["match"])["Played"] != true || det["HomeTeamScore"] == nil {
			t.Errorf("fixture not played: %v", result["match"])
		}
		n, _, err := repo.one(ctx, `SELECT count(*)::int AS n FROM "MatchReplays" WHERE "FixtureId" = $1`, fixtureID)
		if err != nil {
			return err
		}
		if intOf(n["n"]) != 1 {
			t.Errorf("replay rows = %v, want exactly 1", n["n"])
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back double kickoff: %v", err)
	}
}
