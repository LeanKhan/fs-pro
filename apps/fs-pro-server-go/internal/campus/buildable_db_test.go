package campus

import (
	"context"
	"testing"
	"time"

	"fs-pro-server/internal/abilities"
	"fs-pro-server/internal/db"
)

// The Coaching Department and Video Analysis are P2 research tiles that the P10
// report found unbuildable (seeded read-gates only). They are now in the campus
// facility set and cost Fans (04 §1.1), so campus.upgrade raises them and the
// ability facility gate reads the real ClubAssets level.

func assetLevel(t *testing.T, ctx context.Context, q db.Querier, clubID, key string) int {
	t.Helper()
	assets := mustAssets(t, ctx, q, clubID)
	if row := assets[key]; row != nil {
		return intOf(row["Level"])
	}
	return 0
}

func TestResearchFacilityUpgradeRolledBack(t *testing.T) {
	_, ctx, inRollback := campusPool(t)
	inRollback(func(tx db.Querier) error {
		repo := NewRepository(tx)
		club := newTestClub(t, ctx, tx, map[string]any{
			"Budget": 10_000_000.0, "Fans": 10_000_000, "ClubhouseTier": 3,
		})
		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

		// --- cost/currency: coaching_dept is paid in Fans, never Cash ---------
		fansBefore := intOf(mustClubRow(t, ctx, tx, club)["Fans"])
		budgetBefore := floatOf(mustClubRow(t, ctx, tx, club)["Budget"])
		def := Facilities["coaching_dept"]
		if err := repo.StartUpgrade(ctx, club, "coaching_dept", now, 1); err != nil {
			return err
		}
		cost := int(UpgradeCostFor(def, 1))
		after := mustClubRow(t, ctx, tx, club)
		if intOf(after["Fans"]) != fansBefore-cost {
			t.Errorf("coaching_dept Fans = %d, want %d (cost %d)", intOf(after["Fans"]), fansBefore-cost, cost)
		}
		if floatOf(after["Budget"]) != budgetBefore {
			t.Errorf("coaching_dept must not touch Cash: %v -> %v", budgetBefore, floatOf(after["Budget"]))
		}

		// --- the upgrade promotes the level when due --------------------------
		if err := forceComplete(ctx, tx, club, "coaching_dept", now.Add(-time.Minute)); err != nil {
			return err
		}
		if _, err := SweepDueUpgrades(ctx, tx, now); err != nil {
			return err
		}
		if got := assetLevel(t, ctx, tx, club, "coaching_dept"); got != 1 {
			t.Errorf("coaching_dept level = %d, want 1 after promotion", got)
		}

		// --- the ability syllabus unlocks at the new tier ---------------------
		// whipped_cross needs facility tier 1 and mastery tier 2.
		ability, ok := abilities.AbilityByID("whipped_cross")
		if !ok {
			t.Fatal("whipped_cross missing from the ability registry")
		}
		tierBefore := ResearchTier(0, 0)
		if abilities.CanLearn(ability, tierBefore, 2) {
			t.Error("whipped_cross was learnable before the Coaching Department existed")
		}
		tierAfter := ResearchTier(
			assetLevel(t, ctx, tx, club, "coaching_dept"),
			assetLevel(t, ctx, tx, club, "video_analysis"),
		)
		if tierAfter != 1 {
			t.Fatalf("research tier = %d, want 1 after Coaching L1", tierAfter)
		}
		if !abilities.CanLearn(ability, tierAfter, 2) {
			t.Error("whipped_cross did not unlock at research tier 1")
		}

		// --- video_analysis is buildable and also paid in Fans ----------------
		vdef := Facilities["video_analysis"]
		if vdef.Currency != Fans {
			t.Fatalf("video_analysis currency = %s, want Fans", vdef.Currency)
		}
		fansBefore = intOf(mustClubRow(t, ctx, tx, club)["Fans"])
		if err := repo.StartUpgrade(ctx, club, "video_analysis", now, 1); err != nil {
			return err
		}
		if got := intOf(mustClubRow(t, ctx, tx, club)["Fans"]); got != fansBefore-int(UpgradeCostFor(vdef, 1)) {
			t.Errorf("video_analysis Fans = %d, want %d", got, fansBefore-int(UpgradeCostFor(vdef, 1)))
		}
		return nil
	})
}

// forceComplete makes a queued upgrade due so the sweep promotes it.
func forceComplete(ctx context.Context, q db.Querier, clubID, assetType string, at time.Time) error {
	_, err := q.Exec(ctx, `UPDATE "ClubAssets" SET "CompleteAt" = $3
		WHERE "ClubId" = $1 AND "AssetType" = $2`, clubID, assetType, at)
	return err
}
