package game

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/fixture"
)

func httpGet(url string) (*http.Response, error) { return http.Get(url) }

func scanOne(ctx context.Context, q db.Querier, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

// TestKickoffNewRealSim plays two fixtures on the same day against the running
// sim and checks the simulate_rest loop plays both (rolled back).
func TestKickoffNewRealSim(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	simURL := os.Getenv("SIM_SERVICE_URL")
	if simURL == "" {
		simURL = "http://127.0.0.1:5050"
	}
	if resp, err := httpGet(simURL + "/health"); err != nil {
		t.Skipf("sim unavailable: %v", err)
	} else {
		resp.Body.Close()
	}
	pool, err := db.New(context.Background(), url, 15*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()
	ctx := context.Background()

	run := func(tx db.Querier) error {
		// Three clubs with a legal squad.
		rows, err := tx.Query(ctx, `SELECT c."_id" AS id, c."Name" AS name, c."ClubCode" AS code FROM "Clubs" c
			WHERE c."ReleasedAt" IS NULL
			  AND (SELECT count(*) FROM "Players" p WHERE p."ClubId" = c."_id" AND p."isSigned" = true AND p."isRetired" = false) >= 11
			ORDER BY c."Rating" DESC LIMIT 3`)
		if err != nil {
			return err
		}
		clubs, err := db.ScanAll(rows)
		if err != nil {
			return err
		}
		if len(clubs) < 3 {
			t.Skip("need three clubs with legal squads")
		}
		id := func(i int) string { return db.StringField(clubs[i], "id") }
		code := func(i int) string { return db.StringField(clubs[i], "code") }
		name := func(i int) string { return db.StringField(clubs[i], "name") }

		mk := func(home, away int) (string, error) {
			row, err := db.InsertRow(ctx, tx, "Fixtures", map[string]any{
				"Title": name(home) + " vs " + name(away), "Home": code(home), "Away": code(away),
				"HomeTeamId": id(home), "AwayTeamId": id(away), "Type": "friendly", "Stage": "friendly",
				"Played": false, "SaveStats": true, "ScheduledDay": 1000, "updatedAt": time.Now(),
			})
			if err != nil {
				return "", err
			}
			return db.StringField(row, "_id"), nil
		}
		fx1, err := mk(0, 1)
		if err != nil {
			return err
		}
		fx2, err := mk(1, 2)
		if err != nil {
			return err
		}

		h := New(fixture.NewRepository(tx))
		req := httptest.NewRequest("GET", "/api/game/kickoff-new/"+fx1+"?simulate_rest=true&quick_sim=true", nil)
		req.SetPathValue("fixture", fx1)
		resp := h.kickoffNew(nil, nil, req)
		if resp.Status != 200 {
			t.Fatalf("kickoffNew status %d: %v", resp.Status, resp.Body["message"])
		}
		played := gmapOf(resp.Body["payload"])["match"].(map[string]any)
		det := played["Details"].(map[string]any)
		if played["Played"] != true || det["HomeTeamScore"] == nil {
			t.Errorf("main fixture not played: %v", played)
		}
		t.Logf("kickoff %s: %v-%v", fx1, det["HomeTeamScore"], det["AwayTeamScore"])

		// The day loop played the other fixture too.
		other, _, err := scanOne(ctx, tx, `SELECT "Played","Details" FROM "Fixtures" WHERE "_id" = $1`, fx2)
		if err != nil {
			return err
		}
		if other == nil || other["Played"] != true {
			t.Error("simulate_rest did not play the second fixture")
		}

		// enqueueMatch returns 202 with the exact body.
		req2 := httptest.NewRequest("GET", "/api/game/enqueue/"+fx1, nil)
		req2.SetPathValue("fixture", fx1)
		resp2 := h.enqueueMatch(nil, nil, req2)
		if resp2.Status != 202 || resp2.Body["message"] != "Match enqueued for simulation" {
			t.Errorf("enqueue = %d %v", resp2.Status, resp2.Body)
		}
		if fid := gmapOf(resp2.Body["payload"])["fixture_id"]; fid != fx1 {
			t.Errorf("enqueue payload = %v", resp2.Body["payload"])
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back kickoff: %v", err)
	}
}
