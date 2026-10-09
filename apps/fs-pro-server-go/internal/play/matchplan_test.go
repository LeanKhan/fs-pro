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

func TestStyleHelpers(t *testing.T) {
	if styleKey("high press") != "HighPress" || styleKey("HighPress") != "HighPress" || styleKey("bogus") != "Balanced" {
		t.Errorf("styleKey wrong")
	}
	if styleMatchup("HighPress", "Possession") != 1 || styleMatchup("Possession", "HighPress") != -1 || styleMatchup("HighPress", "LowBlock") != 0 {
		t.Errorf("styleMatchup wrong")
	}
	if counterTo("Possession") != "HighPress" {
		t.Errorf("counterTo wrong: %v", counterTo("Possession"))
	}
}

func TestCheckPlan(t *testing.T) {
	squad := map[string]bool{"a": true, "b": true}
	if err := checkPlan(map[string]any{"startingXI": []any{"a", "a"}}, squad); err == nil {
		t.Error("duplicate id accepted")
	}
	if err := checkPlan(map[string]any{"startingXI": []any{"a", "x"}}, squad); err == nil {
		t.Error("foreign id accepted")
	}
	if err := checkPlan(map[string]any{"startingXI": []any{"a"}}, squad); err == nil {
		t.Error("partial XI accepted")
	}
	if err := checkPlan(map[string]any{"startingXI": []any{}}, squad); err != nil {
		t.Errorf("empty XI rejected: %v", err)
	}
}

func managedClub(ctx context.Context, q db.Querier) (map[string]any, bool) {
	row, ok, _ := (&Repository{q: q}).one(ctx, `SELECT c."_id" FROM "Clubs" c
		WHERE c."ReleasedAt" IS NULL
		  AND EXISTS (SELECT 1 FROM "Managers" m WHERE m."ClubId" = c."_id" AND m."isEmployed" = true)
		  AND (SELECT count(*) FROM "Players" p WHERE p."ClubId" = c."_id" AND p."isSigned" = true AND p."isRetired" = false
		       AND (p."Injury" IS NULL OR (p."Injury"->>'daysRemaining')::int <= 0)) >= 11
		ORDER BY c."Rating" DESC LIMIT 1`)
	return row, ok
}

func TestMatchPlanRolledBack(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	resp, err := http.Get(clients.SimServiceURL() + "/health")
	if err != nil {
		t.Skipf("sim unavailable: %v", err)
	}
	_ = resp.Body.Close()
	pool, err := db.New(context.Background(), url, 15*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()
	ctx := context.Background()

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)
		club, ok := managedClub(ctx, tx)
		if !ok {
			t.Skip("no managed club with a legal squad")
		}
		clubID := db.StringField(club, "_id")
		opp, _, _ := repo.one(ctx, `SELECT "_id" FROM "Clubs" WHERE "_id" <> $1 AND "ReleasedAt" IS NULL LIMIT 1`, clubID)
		if opp == nil {
			t.Skip("no opponent")
		}
		oppID := db.StringField(opp, "_id")

		// bookMatch creates a fixture on a cup day.
		fixture, err := repo.BookMatch(ctx, clubID, oppID)
		if err != nil {
			t.Fatalf("bookMatch: %v", err)
		}
		fixtureID := db.StringField(fixture, "fixtureId")
		if fixtureID == "" || db.StringField(fixture, "kind") != "booked" {
			t.Fatalf("booked fixture = %v", fixture)
		}
		w, _ := repo.world(ctx)
		if d := intOf(fixture["day"]); d == 0 || dayKindOf(w, d) != "C" {
			t.Errorf("booked day %d is not a cup day", d)
		}

		// prep round-trip.
		prep, err := repo.GetMatchPrep(ctx, clubID, fixtureID)
		if err != nil {
			t.Fatalf("getMatchPrep: %v", err)
		}
		if prep["fixture"] == nil || prep["plan"] == nil || prep["scout"] == nil {
			t.Errorf("prep missing keys: %v", prep)
		}
		plan := mapOf(prep["plan"])
		if _, err := repo.SaveMatchPlan(ctx, clubID, fixtureID, plan, false); err != nil {
			t.Fatalf("saveMatchPlan: %v", err)
		}
		after, err := repo.GetMatchPrep(ctx, clubID, fixtureID)
		if err != nil {
			return err
		}
		if ok, _ := mapOf(after["fixture"])["planSet"].(bool); !ok {
			t.Error("planSet not true after save")
		}

		// preview against the live engine.
		preview, err := repo.PreviewMatchPlan(ctx, clubID, fixtureID, plan)
		if err != nil {
			t.Fatalf("previewMatchPlan: %v", err)
		}
		runs := intOf(preview["runs"])
		win := numOf(preview["win"])
		if runs == 0 {
			t.Error("preview ran 0 matches")
		}
		t.Logf("preview: runs=%d win=%.2f draw=%.2f loss=%.2f gf=%.2f ga=%.2f",
			runs, win, numOf(preview["draw"]), numOf(preview["loss"]), numOf(preview["goalsFor"]), numOf(preview["goalsAgainst"]))
		if win < 0 || win > 1 {
			t.Errorf("win chance out of range: %v", win)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back match plan: %v", err)
	}
}
