package campus

import (
	"context"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

// Obstacle backfill for clubs founded after migration 0045: the three Derelict
// Grounds obstacles are lazily seeded on the first campus read, once, and a club
// that cleared them all is never re-seeded (rows are kept with ClearedAt).

func obstacleRowCount(t *testing.T, ctx context.Context, q db.Querier, clubID string) (total, active int) {
	t.Helper()
	row, ok, err := dbScanOne(ctx, q, `SELECT count(*)::int AS total,
		count(*) FILTER (WHERE "ClearedAt" IS NULL)::int AS active
		FROM "CampusObstacles" WHERE "ClubId" = $1`, clubID)
	if err != nil || !ok {
		t.Fatalf("obstacle count: ok=%v err=%v", ok, err)
	}
	return intOf(row["total"]), intOf(row["active"])
}

func TestObstaclesLazySeedRolledBack(t *testing.T) {
	_, ctx, inRollback := campusPool(t)
	inRollback(func(tx db.Querier) error {
		repo := NewRepository(tx)
		club := newTestClub(t, ctx, tx, map[string]any{"Budget": 1_000_000.0})
		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

		if total, active := obstacleRowCount(t, ctx, tx, club); total != 0 || active != 0 {
			t.Fatalf("a fresh club must start with no obstacles, got total=%d active=%d", total, active)
		}

		state, ok, err := repo.BuildState(ctx, club, now, 1)
		if err != nil || !ok {
			return err
		}
		list, _ := state["obstacles"].([]any)
		if len(list) != 3 {
			t.Fatalf("lazy seed produced %d obstacles, want 3", len(list))
		}
		kinds := map[string]bool{}
		for _, v := range list {
			m, _ := v.(map[string]any)
			kinds[db.StringField(m, "kind")] = true
		}
		for k := range kinds {
			if _, ok := ObstacleDefFor(k); !ok {
				t.Errorf("seeded an unknown obstacle kind %q", k)
			}
		}

		// Idempotent: a second read does not seed another three.
		if _, _, err := repo.BuildState(ctx, club, now, 1); err != nil {
			return err
		}
		if total, _ := obstacleRowCount(t, ctx, tx, club); total != 3 {
			t.Errorf("a second read seeded more obstacles: total=%d, want 3", total)
		}

		// Clearing everything must not re-seed.
		for _, v := range list {
			m, _ := v.(map[string]any)
			if err := repo.ClearObstacle(ctx, club, db.StringField(m, "id"), now); err != nil {
				return err
			}
		}
		state, _, err = repo.BuildState(ctx, club, now, 1)
		if err != nil {
			return err
		}
		if cleared, _ := state["obstacles"].([]any); len(cleared) != 0 {
			t.Errorf("cleared club re-seeded obstacles: %d active", len(cleared))
		}
		if total, _ := obstacleRowCount(t, ctx, tx, club); total != 3 {
			t.Errorf("cleared rows must be kept: total=%d, want 3", total)
		}
		return nil
	})
}
