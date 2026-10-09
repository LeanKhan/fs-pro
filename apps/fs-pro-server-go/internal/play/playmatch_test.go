package play

import (
	"context"
	"net/http"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/clients"
	"fs-pro-server/internal/db"
)

// TestPlayMatchRealSim is the end-to-end proof: a real club with a manager and
// a legal squad is played against the RUNNING sim service, inside a transaction
// that is rolled back, so no data changes survive.
func TestPlayMatchRealSim(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	resp, err := http.Get(clients.SimServiceURL() + "/health")
	if err != nil {
		t.Skipf("sim service unavailable: %v", err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Skipf("sim service unhealthy: %d", resp.StatusCode)
	}
	pool, err := db.New(context.Background(), url, 15*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()
	ctx := context.Background()

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)
		row, ok, err := repo.one(ctx, `SELECT c."_id" FROM "Clubs" c
			WHERE c."ReleasedAt" IS NULL
			  AND EXISTS (SELECT 1 FROM "Managers" m WHERE m."ClubId" = c."_id" AND m."isEmployed" = true)
			  AND (SELECT count(*) FROM "Players" p WHERE p."ClubId" = c."_id" AND p."isSigned" = true AND p."isRetired" = false
			       AND (p."Injury" IS NULL OR (p."Injury"->>'daysRemaining')::int <= 0)) >= 11
			ORDER BY c."Rating" DESC LIMIT 1`)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no managed club with a legal squad")
		}
		clubID := db.StringField(row, "_id")
		// Clear any cooldown from prior fixtures.
		if _, err := tx.Exec(ctx, `UPDATE "Fixtures" SET "PlayedAt" = now() - interval '1 day' WHERE "HomeTeamId" = $1 AND "Title" LIKE '%(Matchmade)'`, clubID); err != nil {
			return err
		}

		result, err := repo.PlayMatch(ctx, clubID, "", true)
		if err != nil {
			t.Fatalf("PlayMatch: %v", err)
		}
		score, _ := result["score"].(map[string]any)
		you, them := intOf(score["you"]), intOf(score["them"])
		t.Logf("score: %s %d - %d %s", db.StringField(row, "_id"), you, them, "opponent")
		if you < 0 || them < 0 {
			t.Errorf("bad score %v", result["score"])
		}
		rewards, _ := result["rewards"].(map[string]any)
		if numOf(rewards["xp"]) <= 0 {
			t.Errorf("no XP reward: %v", rewards)
		}
		fixtureID := db.StringField(result, "fixtureId")
		if fixtureID == "" {
			t.Fatal("no fixtureId")
		}
		// The match_reward ledger row (only written for a positive cash reward).
		if numOf(rewards["cash"]) > 0 {
			n, _, err := repo.one(ctx, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "Type" = 'match_reward' AND "BuyerClubId" = $1`, clubID)
			if err != nil {
				return err
			}
			if intOf(n["n"]) < 1 {
				t.Error("no match_reward ledger row")
			}
		}
		// Cooldown is set by the played fixture.
		cool, err := repo.matchCooldown(ctx, clubID)
		if err != nil {
			return err
		}
		if cool <= 0 {
			t.Errorf("cooldown not set (%d)", cool)
		}
		// A stored replay when watching.
		replay, _, err := repo.one(ctx, `SELECT "_id" FROM "MatchReplays" WHERE "FixtureId" = $1`, fixtureID)
		if err != nil {
			return err
		}
		if replay == nil {
			t.Error("no stored replay")
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back playMatch: %v", err)
	}
}
