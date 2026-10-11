package facilities

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

// TestStartUpgradeEnforcesClubhouseCap pins the CoC "Town Hall caps every
// building" rule (04 §1.1) on the legacy facilities path: a facility cannot be
// raised above the current Clubhouse tier, and raising the tier unlocks the next
// level. Stadium Grounds has no prerequisite, so the cap is the only gate here.
func TestStartUpgradeEnforcesClubhouseCap(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := db.New(ctx, url, 15*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	t.Cleanup(pool.Close)

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)
		row, err := db.InsertRow(ctx, tx, "Clubs", map[string]any{
			"Name": "Facilities Cap Test", "ClubCode": "FCAPTEST",
			"Budget": 10_000_000.0, "ClubhouseTier": 1, "updatedAt": time.Now(),
		})
		if err != nil {
			return err
		}
		clubID := db.StringField(row, "_id")

		// Level 1 at tier 1 is allowed (target 1 == cap 1).
		if err := repo.StartUpgrade(ctx, clubID, StadiumGrounds); err != nil {
			t.Fatalf("stadium L1 at tier 1: %v", err)
		}
		if err := repo.CompleteDueUpgrades(ctx, time.Now().Add(time.Hour)); err != nil {
			return err
		}
		rows, err := repo.AssetRows(ctx, clubID)
		if err != nil {
			return err
		}
		if lvl := levelOf(rows, StadiumGrounds); lvl != 1 {
			t.Fatalf("stadium level = %d, want 1", lvl)
		}

		// Level 2 at tier 1 is refused by the cap.
		err = repo.StartUpgrade(ctx, clubID, StadiumGrounds)
		if err == nil || !strings.Contains(err.Error(), "requires Clubhouse tier 2") {
			t.Fatalf("stadium L2 at tier 1 = %v, want a Clubhouse-tier cap error", err)
		}

		// The read model surfaces the same reason so the client can explain it.
		view, ok, err := New(repo).campus(ctx, clubID)
		if err != nil || !ok {
			t.Fatalf("campus read: ok=%v err=%v", ok, err)
		}
		if reason := assetBlockedReason(view, "stadium_grounds"); reason != "Requires Clubhouse tier 2" {
			t.Errorf("blockedReason = %q, want %q", reason, "Requires Clubhouse tier 2")
		}

		// Raising the Clubhouse to tier 2 unlocks level 2.
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "ClubhouseTier" = 2 WHERE "_id" = $1`, clubID); err != nil {
			return err
		}
		if err := repo.StartUpgrade(ctx, clubID, StadiumGrounds); err != nil {
			t.Fatalf("stadium L2 at tier 2: %v", err)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back run: %v", err)
	}
}

// assetBlockedReason reads assets[i].next.blockedReason from a facilities campus
// payload for one asset type.
func assetBlockedReason(view map[string]any, assetType string) string {
	list, _ := view["assets"].([]any)
	for _, a := range list {
		m, _ := a.(map[string]any)
		if m["type"] != assetType {
			continue
		}
		next, _ := m["next"].(map[string]any)
		s, _ := next["blockedReason"].(string)
		return s
	}
	return ""
}
