package calendar

import (
	"context"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

func TestNewReportAndAddDay(t *testing.T) {
	rep := newReport(7, 3)
	if intOf(rep["day"]) != 7 || intOf(rep["healed"]) != 0 {
		t.Errorf("report = %v", rep)
	}
	m := rep["matches"].(map[string]any)
	if intOf(m["simulated"]) != 0 {
		t.Errorf("matches = %v", m)
	}
	if got := addDay("2026-01-01T00:00:00.000Z"); got.UTC().Format("2006-01-02") != "2026-01-02" {
		t.Errorf("addDay = %v", got)
	}
}

func TestTickAndHealRolledBack(t *testing.T) {
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
		id := func(i int) string { return db.StringField(clubs[i], "id") }
		code := func(i int) string { return db.StringField(clubs[i], "code") }
		name := func(i int) string { return db.StringField(clubs[i], "name") }
		mk := func(home, away, day int) (string, error) {
			row, err := db.InsertRow(ctx, tx, "Fixtures", map[string]any{
				"Title": name(home) + " vs " + name(away), "Home": code(home), "Away": code(away),
				"HomeTeamId": id(home), "AwayTeamId": id(away), "Type": "friendly", "Stage": "friendly",
				"Played": false, "SaveStats": true, "ScheduledDay": day, "KickoffHour": 0, "updatedAt": time.Now(),
			})
			if err != nil {
				return "", err
			}
			return db.StringField(row, "_id"), nil
		}

		// A fixture on day 1; put the clock at day 1, hour 23 (skip day-start heal).
		fx1, err := mk(0, 1, 1)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE "Calendars" SET "CurrentDay" = 1, "CurrentHour" = 23, "CurrentDate" = '2026-01-01T00:00:00.000Z', "updatedAt" = now()`); err != nil {
			return err
		}

		result, err := repo.TickNow(ctx)
		if err != nil {
			t.Fatalf("TickNow: %v", err)
		}
		if intOf(result["toDay"]) != 2 {
			t.Errorf("toDay = %v, want 2", result["toDay"])
		}
		if intOf(result["simulatedFixtures"]) < 1 {
			t.Errorf("simulatedFixtures = %v", result["simulatedFixtures"])
		}
		played, _, err := repo.one(ctx, `SELECT "Played","Details" FROM "Fixtures" WHERE "_id" = $1`, fx1)
		if err != nil {
			return err
		}
		if played == nil || played["Played"] != true {
			t.Error("scheduled fixture was not played")
		}
		det := mapOf(played["Details"])
		t.Logf("tick repaired: day->%v, fixture %s played %v-%v", result["toDay"], fx1, det["HomeTeamScore"], det["AwayTeamScore"])

		// Heal: a past unplayed fixture on day 0.
		fx0, err := mk(1, 0, 0)
		if err != nil {
			return err
		}
		heal, err := repo.HealCalendar(ctx)
		if err != nil {
			t.Fatalf("HealCalendar: %v", err)
		}
		if intOf(heal["healedCount"]) < 1 {
			t.Errorf("healedCount = %v", heal["healedCount"])
		}
		h0, _, err := repo.one(ctx, `SELECT "Played" FROM "Fixtures" WHERE "_id" = $1`, fx0)
		if err != nil {
			return err
		}
		if h0 == nil || h0["Played"] != true {
			t.Error("past fixture was not healed")
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back world day: %v", err)
	}
}

func mapOf(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}
