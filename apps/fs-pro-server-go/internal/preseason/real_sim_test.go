package preseason

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/clients"
	"fs-pro-server/internal/db"
)

// TestPreseasonOpenerRealSquadClears proves the no-dead-end exit criterion
// against the REAL sim engine: a freshly-founded club's default squad clears
// Pre-Season stage 1 (3★). It skips when DATABASE_URL or the sim service is
// unavailable. Both clubs and their squads are created with fixed ids and a
// fixed insertion order so the match is reproducible.
func TestPreseasonOpenerRealSquadClears(t *testing.T) {
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
	ctx := context.Background()
	pool, err := db.New(ctx, url, 30*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()

	attackerID := "11111111-1111-4111-8111-111111111111"
	opponentID := "22222222-2222-4222-8222-222222222222"
	stage := Stages[0]

	run := func(tx db.Querier) error {
		if err := ensurePreseasonSchema(ctx, tx); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO "Clubs" ("_id","Name","ClubCode","Rating","ClubhouseTier","StandingPoints","updatedAt")
			VALUES ($1,'Default Squad FC','PRE-TEST',55,1,0,now())`, attackerID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO "Clubs" ("_id","Name","ClubCode","Rating","ClubhouseTier","ReleasedAt","updatedAt")
			VALUES ($1,$2,$3,$4,1,now(),now())`, opponentID, stage.Opponent, stage.Code, stage.Rating); err != nil {
			return err
		}
		positions := []string{"GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "ATT", "ATT"}
		for i, pos := range positions {
			if _, err := tx.Exec(ctx, `INSERT INTO "Players" ("ClubId","FirstName","LastName","Position","Rating","isSigned","isRetired","updatedAt")
				VALUES ($1,'Home',$2,$3,55,true,false,now())`, attackerID, fmt.Sprintf("P%02d", i+1), pos); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `INSERT INTO "Players" ("ClubId","FirstName","LastName","Position","Rating","isSigned","isRetired","updatedAt")
				VALUES ($1,'Away',$2,$3,$4,true,false,now())`, opponentID, fmt.Sprintf("P%02d", i+1), pos, float64(aiRating(stage.Rating, i))); err != nil {
				return err
			}
		}

		repo := NewRepository(tx) // the real sim service
		res, err := repo.Play(ctx, attackerID, stage.Index, PlayOptions{})
		if err != nil {
			return fmt.Errorf("play opener: %w", err)
		}
		score := res["score"].(map[string]any)
		you, them := intOf(score["you"]), intOf(score["them"])
		t.Logf("opener: default squad %d - %d %s (stars=%v)", you, them, stage.Opponent, res["stars"])
		if you <= them {
			t.Errorf("default squad did not beat the opener: %d-%d", you, them)
		}
		if res["cleared"] != true {
			t.Errorf("opener not cleared 3★ for a default squad: %#v", res["stars"])
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("real-sim opener: %v", err)
	}
}

// TestPreseasonHardestStageRealSquadClears extends the no-dead-end proof to the
// LAST stage: with stages 1..N-1 already cleared, a default squad must also
// clear the hardest opponent 3★. This is the strictest reading of the 06 P9
// exit criterion and skips without the sim service.
func TestPreseasonHardestStageRealSquadClears(t *testing.T) {
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
	ctx := context.Background()
	pool, err := db.New(ctx, url, 30*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()

	attackerID := "33333333-3333-4333-8333-333333333333"
	last := Stages[len(Stages)-1]

	run := func(tx db.Querier) error {
		if err := ensurePreseasonSchema(ctx, tx); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO "Clubs" ("_id","Name","ClubCode","Rating","ClubhouseTier","StandingPoints","updatedAt")
			VALUES ($1,'Default Squad FC','PRE-TEST-B',55,1,0,now())`, attackerID); err != nil {
			return err
		}
		positions := []string{"GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "ATT", "ATT"}
		for i, pos := range positions {
			if _, err := tx.Exec(ctx, `INSERT INTO "Players" ("ClubId","FirstName","LastName","Position","Rating","isSigned","isRetired","updatedAt")
				VALUES ($1,'Home',$2,$3,55,true,false,now())`, attackerID, fmt.Sprintf("P%02d", i+1), pos); err != nil {
				return err
			}
		}
		// Unlock the last stage: every earlier stage is cleared.
		for i, s := range Stages[:len(Stages)-1] {
			if _, err := tx.Exec(ctx, `INSERT INTO "PreseasonProgress" ("ClubId","Stage","BestStars","Attempts","ClearedAt","updatedAt")
				VALUES ($1,$2,3,1,now(),now())`, attackerID, s.Index); err != nil {
				return err
			}
			_ = i
		}

		repo := NewRepository(tx) // the real sim service
		res, err := repo.Play(ctx, attackerID, last.Index, PlayOptions{})
		if err != nil {
			return fmt.Errorf("play hardest stage: %w", err)
		}
		score := res["score"].(map[string]any)
		you, them := intOf(score["you"]), intOf(score["them"])
		t.Logf("hardest stage: default squad %d - %d %s (stars=%v)", you, them, last.Opponent, res["stars"])
		if you <= them {
			t.Errorf("default squad did not beat the hardest stage: %d-%d", you, them)
		}
		if res["cleared"] != true {
			t.Errorf("hardest stage not cleared 3★ for a default squad: stars=%#v", res["stars"])
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("real-sim hardest stage: %v", err)
	}
}
