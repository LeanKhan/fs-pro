package openplay

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

func TestBuildDefinitionDefaults(t *testing.T) {
	def, errs, ok := BuildDefinition(map[string]any{
		"Name":   "Test Cup",
		"Stages": []any{map[string]any{"type": "league", "days": float64(10)}},
		"Type":   "League", // unknown to the schema and must be stripped
	})
	if !ok {
		t.Fatalf("expected valid, errors=%v", errs)
	}
	if def["Prestige"] != 2 {
		t.Errorf("Prestige = %v", def["Prestige"])
	}
	entry := mapOf(def["Entry"])
	if entry["mode"] != "open" || intVal(entry["minClubs"]) != 4 || entry["maxClubs"] != nil {
		t.Errorf("Entry = %v", entry)
	}
	if got := mapOf(def["WinCondition"])["type"]; got != "final-stage" {
		t.Errorf("WinCondition = %v", got)
	}
	rewards := mapOf(def["Rewards"])
	if rewards["prizeMoney"] == nil || rewards["xp"] == nil {
		t.Errorf("Rewards = %v", rewards)
	}
	if _, present := def["Type"]; present {
		t.Error("unknown key Type not stripped")
	}
}

func TestBuildDefinitionTransformsAndWinCondition(t *testing.T) {
	def, _, ok := BuildDefinition(map[string]any{
		"Name": "Knockout Cup",
		"Stages": []any{map[string]any{
			"type": "knockout", "legs": float64(1), "tieDays": float64(3),
			"seeding": "elo", "drawAtEnd": "penalties",
		}},
	})
	if !ok {
		t.Fatal("expected valid")
	}
	if got := mapOf(def["WinCondition"])["type"]; got != "last-standing" {
		t.Errorf("single knockout default = %v", got)
	}
	stage := toMapList(def["Stages"])[0]
	if stage["legs"] != float64(1) || stage["seeding"] != "elo" {
		t.Errorf("stage = %v", stage)
	}

	// A league stage keeps a partial rules subset (unknown rule keys stripped).
	def, _, ok = BuildDefinition(map[string]any{
		"Name": "League", "Prestige": float64(4),
		"Entry":  map[string]any{"mode": "invite", "minClubs": float64(8), "maxClubs": float64(16), "entryFee": float64(100)},
		"Stages": []any{map[string]any{"type": "league", "days": float64(12), "rules": map[string]any{"metric": "points", "junk": true}}},
	})
	if !ok {
		t.Fatal("expected valid")
	}
	entry := mapOf(def["Entry"])
	if entry["mode"] != "invite" || intVal(entry["maxClubs"]) != 16 || numVal(entry["entryFee"]) != 100 {
		t.Errorf("entry = %v", entry)
	}
	rules := mapOf(toMapList(def["Stages"])[0]["rules"])
	if rules["metric"] != "points" {
		t.Errorf("rules = %v", rules)
	}
	if _, present := rules["junk"]; present {
		t.Error("unknown rule key not stripped")
	}
}

func TestBuildDefinitionRejections(t *testing.T) {
	cases := []struct {
		name  string
		input map[string]any
		path  string
		msg   string
	}{
		{"maxClubs below minClubs", map[string]any{
			"Name":   "C",
			"Entry":  map[string]any{"mode": "open", "minClubs": float64(8), "maxClubs": float64(4)},
			"Stages": []any{map[string]any{"type": "league", "days": float64(5)}},
		}, "Entry.maxClubs", "maxClubs is below minClubs"},
		{"last standing without knockout", map[string]any{
			"Name":         "C",
			"Stages":       []any{map[string]any{"type": "league", "days": float64(5)}},
			"WinCondition": map[string]any{"type": "last-standing"},
		}, "WinCondition", "Last standing needs a knockout as the final stage"},
		{"knockout-only with points win", map[string]any{
			"Name":         "C",
			"Stages":       []any{map[string]any{"type": "knockout", "legs": float64(1), "tieDays": float64(3), "seeding": "elo", "drawAtEnd": "penalties"}},
			"WinCondition": map[string]any{"type": "first-to", "metric": "points", "target": float64(10)},
		}, "WinCondition", "A knockout-only competition can only be won by the final stage (last standing)"},
	}
	for _, c := range cases {
		_, errs, ok := BuildDefinition(c.input)
		if ok {
			t.Errorf("%s: expected invalid", c.name)
			continue
		}
		found := false
		for _, e := range errs {
			if e.Path == c.path && e.Message == c.msg {
				found = true
			}
		}
		if !found {
			t.Errorf("%s: errors %v, want path %q message %q", c.name, errs, c.path, c.msg)
		}
	}
}

func TestCompetitionWritesRolledBack(t *testing.T) {
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
		def, errs, ok := BuildDefinition(map[string]any{
			"Name":   "Rollback Cup",
			"Stages": []any{map[string]any{"type": "league", "days": float64(10)}},
		})
		if !ok {
			t.Fatalf("build: %v", errs)
		}
		code := fmt.Sprintf("Z%d", time.Now().UnixNano()%10000000)
		columns := CompetitionColumns(def, "")
		columns["CompetitionCode"] = code
		columns["CompetitionID"] = code
		row, err := repo.CreateCompetition(ctx, columns)
		if err != nil {
			t.Fatalf("create: %v", err)
		}
		if db.StringField(row, "Name") != "Rollback Cup" || db.StringField(row, "Type") != "League" {
			t.Errorf("created row = %v/%v", row["Name"], row["Type"])
		}
		id := db.StringField(row, "_id")

		// Update.
		def2, _, _ := BuildDefinition(map[string]any{
			"Name": "Rollback Cup v2", "Prestige": float64(3),
			"Stages": []any{map[string]any{"type": "league", "days": float64(20)}},
		})
		upd, found, err := repo.UpdateCompetition(ctx, id, CompetitionColumns(def2, "League"))
		if err != nil || !found {
			t.Fatalf("update: %v / %v", err, found)
		}
		if db.StringField(upd, "Name") != "Rollback Cup v2" || intVal(upd["Prestige"]) != 3 {
			t.Errorf("updated = %v/%v", upd["Name"], upd["Prestige"])
		}

		// Archive.
		arch, found, err := repo.ArchiveCompetition(ctx, id, true)
		if err != nil || !found || !boolVal(arch["Archived"]) {
			t.Fatalf("archive: %v / %v / %v", err, found, arch["Archived"])
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back competition writes: %v", err)
	}
}

func TestPublishAndCancelRolledBack(t *testing.T) {
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
		comp, ok, err := dbScanOne(ctx, tx, `SELECT "_id" FROM "Competitions" WHERE "Stages" IS NOT NULL ORDER BY "Name" LIMIT 1`)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no competition with stages")
		}
		cal, err := calendarAt(ctx, tx)
		if err != nil {
			return err
		}
		today := intVal(cal["CurrentDay"])
		edition, err := repo.CreateEdition(ctx, db.StringField(comp, "_id"), EditionDates{today, today, today})
		if err != nil {
			t.Fatalf("create edition: %v", err)
		}
		editionID := db.StringField(edition, "_id")

		published, err := repo.PublishEdition(ctx, editionID)
		if err != nil {
			t.Fatalf("publish: %v", err)
		}
		def := mapOf(published["Definition"])
		if def == nil {
			t.Fatal("publish did not snapshot a definition")
		}
		for _, key := range []string{"Name", "Prestige", "Entry", "Stages", "WinCondition", "Rewards"} {
			if _, present := def[key]; !present {
				t.Errorf("snapshotted definition missing %q", key)
			}
		}

		// Register a club with a paid fee, then cancel and expect a refund.
		clubRow, ok, err := dbScanOne(ctx, tx, `SELECT "_id" FROM "Clubs" ORDER BY "Budget" DESC NULLS LAST LIMIT 1`)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no club")
		}
		clubID := db.StringField(clubRow, "_id")
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Budget" = 1000 WHERE "_id" = $1`, clubID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE "Seasons" SET "Status" = 'registration' WHERE "_id" = $1`, editionID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO "Entries" ("SeasonId","ClubId","Status","FeePaid","updatedAt") VALUES ($1,$2,'registered',200,now())`, editionID, clubID); err != nil {
			return err
		}

		cancelled, err := repo.CancelEdition(ctx, editionID, "test cancel")
		if err != nil {
			t.Fatalf("cancel: %v", err)
		}
		if db.StringField(cancelled, "Status") != "cancelled" {
			t.Errorf("cancel status = %v", cancelled["Status"])
		}
		logs := toAnyList(cancelled["Logs"])
		if len(logs) == 0 {
			t.Error("cancel did not append a Logs entry")
		}
		budget, err := scalarFloat(ctx, tx, `SELECT "Budget" AS v FROM "Clubs" WHERE "_id" = $1`, clubID)
		if err != nil {
			return err
		}
		if budget != 1200 {
			t.Errorf("budget after refund = %v, want 1200", budget)
		}
		feePaid, err := scalarFloat(ctx, tx, `SELECT "FeePaid" AS v FROM "Entries" WHERE "SeasonId" = $1 AND "ClubId" = $2`, editionID, clubID)
		if err != nil {
			return err
		}
		if feePaid != 0 {
			t.Errorf("entry FeePaid = %v, want 0", feePaid)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back publish/cancel: %v", err)
	}
}
