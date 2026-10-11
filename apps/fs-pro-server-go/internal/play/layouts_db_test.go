package play

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/grid"
)

// TestBuildSimRequestInjectsStoredLayout is the DB integration proof that a
// club's stored grid is compiled into `tactics.<side>.slots` (docs/coc-mapping/05
// §5). It runs rolled back and skips until Clubs.Layouts is migrated (0045).
func TestBuildSimRequestInjectsStoredLayout(t *testing.T) {
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
		clubID, err := ensureSquadClub(ctx, tx)
		if err != nil {
			return err
		}
		repo := NewRepository(tx)
		club, _, _ := repo.one(ctx, `SELECT * FROM "Clubs" WHERE "_id" = $1`, clubID)
		if club == nil {
			t.Skip("club vanished")
		}

		// Save a legal Home grid for the club.
		g := grid.Grid{Slots: []grid.Slot{
			{Col: 0, Row: 3, PlayerID: "p1", Position: grid.GK},
			{Col: 1, Row: 1, PlayerID: "p2", Position: grid.DEF},
			{Col: 1, Row: 3, PlayerID: "p3", Position: grid.DEF},
			{Col: 1, Row: 5, PlayerID: "p4", Position: grid.DEF},
			{Col: 3, Row: 0, PlayerID: "p5", Position: grid.MID},
			{Col: 3, Row: 2, PlayerID: "p6", Position: grid.MID},
			{Col: 3, Row: 4, PlayerID: "p7", Position: grid.MID},
			{Col: 3, Row: 6, PlayerID: "p8", Position: grid.MID},
			{Col: 4, Row: 1, PlayerID: "p9", Position: grid.ATT},
			{Col: 4, Row: 3, PlayerID: "p10", Position: grid.ATT},
			{Col: 4, Row: 5, PlayerID: "p11", Position: grid.ATT},
		}}
		if err := grid.NewService(grid.NewPgRepository(tx)).SaveLayout(ctx, clubID, grid.Home, g, 5); err != nil {
			t.Fatalf("SaveLayout: %v", err)
		}

		req, err := repo.buildSimRequestWithTactics(ctx, "fx-1", clubID, clubID, club, club, tacticOf(club), tacticOf(club), false)
		if err != nil {
			t.Fatalf("buildSimRequestWithTactics: %v", err)
		}
		tactics, _ := req["tactics"].(map[string]any)
		for _, side := range []string{"home", "away"} {
			tac, _ := tactics[side].(map[string]any)
			slots, ok := tac["slots"].([]grid.SimSlot)
			if !ok || len(slots) != grid.Starters {
				t.Errorf("%s slots = %#v, want %d compiled anchors", side, tac["slots"], grid.Starters)
			}
		}
		// The anchors must match a direct compile of the stored grid.
		want := grid.SimSlots(g)
		homeTactic, _ := tactics["home"].(map[string]any)
		if got, _ := homeTactic["slots"].([]grid.SimSlot); len(got) > 0 && got[0].X != want[0].X {
			t.Errorf("keeper anchor x = %v, want %v", got[0].X, want[0].X)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back sim request: %v", err)
	}
}

// ensureSquadClub returns a club with a full squad, inserting a synthetic one
// inside the rolled-back transaction when the scratch database is empty. The
// added Clubs.Layouts column is DDL and rolls back with the transaction.
func ensureSquadClub(ctx context.Context, q db.Querier) (string, error) {
	if _, err := q.Exec(ctx, `ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "Layouts" jsonb`); err != nil {
		return "", err
	}
	rows, err := q.Query(ctx, `SELECT c."_id" FROM "Clubs" c WHERE
		(SELECT count(*) FROM "Players" p WHERE p."ClubId" = c."_id" AND p."isSigned" = true AND p."isRetired" = false) >= 11
		ORDER BY c."_id" LIMIT 1`)
	if err != nil {
		return "", err
	}
	if m, ok, err := db.ScanOne(rows); err != nil {
		return "", err
	} else if ok {
		return db.StringField(m, "_id"), nil
	}

	rows, err = q.Query(ctx, `INSERT INTO "Clubs" ("Name", "ClubCode", "updatedAt")
		VALUES ('FS-Pro Play Test FC', 'PLYTST', now()) RETURNING "_id"`)
	if err != nil {
		return "", err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return "", err
	}
	clubID := db.StringField(m, "_id")
	positions := []string{"GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "ATT", "ATT"}
	for i, pos := range positions {
		if _, err := q.Exec(ctx, `INSERT INTO "Players" ("ClubId", "FirstName", "LastName", "Position", "Rating", "isSigned", "isRetired", "updatedAt")
			VALUES ($1, 'Test', $2, $3, 70, true, false, now())`, clubID, fmt.Sprintf("Player%d", i+1), pos); err != nil {
			return "", err
		}
	}
	return clubID, nil
}
