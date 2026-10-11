package campus

import (
	"context"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

func insertSquadPlayer(t *testing.T, ctx context.Context, q db.Querier, clubID, position, role string) {
	t.Helper()
	if _, err := q.Exec(ctx, `INSERT INTO "Players" ("FirstName","LastName","ClubId","Position","Role","isSigned","updatedAt")
		VALUES ('Squad','Player',$1,$2,$3,true,now())`, clubID, position, role); err != nil {
		t.Fatalf("insert player: %v", err)
	}
}

func TestSquadStateRolledBack(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := db.New(ctx, url, 15*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)

		// A canonical XI (one small archetype per role) fits the base cap and
		// must not be refused: the check is additive to gate.go.
		light := newTestClub(t, ctx, tx, map[string]any{"ClubhouseTier": 1})
		insertSquadPlayer(t, ctx, tx, light, "GK", "GK")
		for i := 0; i < 4; i++ {
			insertSquadPlayer(t, ctx, tx, light, "MID", "CM") // swarm (1 each)
		}
		for i := 0; i < 6; i++ {
			insertSquadPlayer(t, ctx, tx, light, "ATT", "LM") // flank rusher (2 each)
		}
		status, ok, err := repo.SquadState(ctx, light)
		if err != nil || !ok {
			t.Fatalf("SquadState ok=%v err=%v", ok, err)
		}
		if status.Capacity != SquadCampBaseCapacity {
			t.Errorf("capacity = %d, want %d", status.Capacity, SquadCampBaseCapacity)
		}
		if status.Refusal != nil {
			t.Errorf("light squad must fit: %+v", status.Refusal)
		}
		if status.Used != 2+4*1+6*2 {
			t.Errorf("used = %d, want %d", status.Used, 2+4+12)
		}

		// Eleven anchors use 33 slots > the 30-slot base.
		heavy := newTestClub(t, ctx, tx, map[string]any{"ClubhouseTier": 1})
		for i := 0; i < 11; i++ {
			insertSquadPlayer(t, ctx, tx, heavy, "DEF", "CB") // anchor (3 each)
		}
		status, ok, err = repo.SquadState(ctx, heavy)
		if err != nil || !ok {
			t.Fatalf("SquadState heavy ok=%v err=%v", ok, err)
		}
		if status.Refusal == nil || status.Refusal.Code != "squad_over_capacity" {
			t.Fatalf("heavy squad = %+v, want squad_over_capacity", status.Refusal)
		}

		// Upgrading the Squad Camp raises the cap and clears the refusal.
		if _, err := tx.Exec(ctx, `INSERT INTO "ClubAssets" ("ClubId","AssetType","Level","updatedAt")
			VALUES ($1,'squad_camp',2,now())`, heavy); err != nil {
			return err
		}
		status, ok, err = repo.SquadState(ctx, heavy)
		if err != nil || !ok {
			t.Fatalf("SquadState upgraded ok=%v err=%v", ok, err)
		}
		if status.Refusal != nil {
			t.Errorf("camp level 2 (40 slots) must fit 33: %+v", status.Refusal)
		}

		// A missing club is reported, not invented.
		if _, ok, err := repo.SquadState(ctx, "00000000-0000-0000-0000-000000000000"); err != nil || ok {
			t.Errorf("missing club: ok=%v err=%v, want false/nil", ok, err)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back squad state: %v", err)
	}
}
