package clubhouse

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

func TestSevenBuildingsEachAssetOnce(t *testing.T) {
	if len(Buildings) > 7 {
		t.Fatalf("%d buildings, the campus allows at most 7", len(Buildings))
	}
	seen := map[string]bool{}
	for _, b := range Buildings {
		for _, a := range append([]string{b.Primary}, b.Linked...) {
			if seen[a] {
				t.Errorf("asset %s belongs to two buildings", a)
			}
			seen[a] = true
		}
	}
}

func TestLinkedRefusal(t *testing.T) {
	if why := LinkedRefusal("training_ground"); why != "" {
		t.Errorf("a primary must be upgradable, got %q", why)
	}
	if why := LinkedRefusal("coaching_dept"); !strings.Contains(why, "Training Ground") {
		t.Errorf("coaching_dept should point at the Training Ground, got %q", why)
	}
	if why := LinkedRefusal("not_a_building"); why != "" {
		t.Errorf("unknown assets are not ours to refuse, got %q", why)
	}
}

func TestSweepLiftsLinkedAssetsRolledBack(t *testing.T) {
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
	err = db.InRollback(ctx, pool, func(tx db.Querier) error {
		var clubID string
		if err := tx.QueryRow(ctx, `INSERT INTO "Clubs" ("Name","ClubCode","updatedAt") VALUES ('Linked Test FC','LKT9',now()) RETURNING "_id"::text`).Scan(&clubID); err != nil {
			return err
		}
		// A Training Ground upgrade to level 2 that is already due.
		now := time.Now().UTC()
		if _, err := tx.Exec(ctx, `INSERT INTO "ClubAssets" ("ClubId","AssetType","Level","UpgradingTo","StartAt","CompleteAt","updatedAt")
			VALUES ($1,'training_ground',1,2,$2,$3,now())`, clubID, now.Add(-2*time.Hour), now.Add(-time.Minute)); err != nil {
			return err
		}
		if n, err := SweepDueUpgrades(ctx, tx, now); err != nil || n == 0 {
			t.Fatalf("sweep promoted %d, err %v", n, err)
		}
		for _, a := range []string{"training_ground", "staff_house", "coaching_dept", "video_analysis"} {
			var lvl int
			if err := tx.QueryRow(ctx, `SELECT "Level" FROM "ClubAssets" WHERE "ClubId" = $1 AND "AssetType" = $2`, clubID, a).Scan(&lvl); err != nil {
				t.Errorf("%s: %v", a, err)
				continue
			}
			if lvl != 2 {
				t.Errorf("%s level = %d, want 2", a, lvl)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
