package campus

import (
	"errors"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

// TestUpgradeEnforcesClubhouseCap pins the CoC "Town Hall caps every building"
// rule (04 §1.1) on the campus path: a facility cannot be raised above the
// current Clubhouse tier, and raising the tier unlocks the next level.
func TestUpgradeEnforcesClubhouseCap(t *testing.T) {
	_, ctx, inRollback := campusPool(t)
	inRollback(func(tx db.Querier) error {
		repo := NewRepository(tx)
		club := newTestClub(t, ctx, tx, map[string]any{
			"Budget": 10_000_000.0, "Fans": 10_000_000, "ClubhouseTier": 1,
		})
		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

		// Level 1 at tier 1 is allowed (target 1 == cap 1). turnstiles has no
		// prerequisite, so the cap is the only gate.
		if err := repo.StartUpgrade(ctx, club, "turnstiles", now, 1); err != nil {
			t.Fatalf("turnstiles L1 at tier 1: %v", err)
		}
		if err := forceComplete(ctx, tx, club, "turnstiles", now.Add(-time.Minute)); err != nil {
			return err
		}
		if _, err := SweepDueUpgrades(ctx, tx, now); err != nil {
			return err
		}
		if got := assetLevel(t, ctx, tx, club, "turnstiles"); got != 1 {
			t.Fatalf("turnstiles level = %d, want 1", got)
		}

		// Level 2 at tier 1 is refused by the cap.
		err := repo.StartUpgrade(ctx, club, "turnstiles", now, 1)
		if !errors.Is(err, ErrFacilityCapped) {
			t.Fatalf("turnstiles L2 at tier 1 = %v, want ErrFacilityCapped", err)
		}

		// Raising the Clubhouse to tier 2 unlocks level 2.
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "ClubhouseTier" = 2 WHERE "_id" = $1`, club); err != nil {
			return err
		}
		if err := repo.StartUpgrade(ctx, club, "turnstiles", now, 1); err != nil {
			t.Fatalf("turnstiles L2 at tier 2: %v", err)
		}
		return nil
	})
}
