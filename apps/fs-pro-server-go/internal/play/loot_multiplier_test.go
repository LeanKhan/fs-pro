package play

import (
	"fmt"
	"testing"

	"fs-pro-server/internal/db"
)

// TestLootMultiplierAppliedOncePerWin is the P6 exit-criterion proof
// (docs/coc-mapping/06 P6): the attacker's Standing-League loot multiplier is
// applied exactly once per win — the ledger carries one raid_loot row per
// currency at the multiplied amount — and re-resolving the same raid applies
// nothing further.
func TestLootMultiplierAppliedOncePerWin(t *testing.T) {
	_, ctx, inRollback := raidPool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensureRaidSchema(ctx, tx); err != nil {
			return err
		}
		a, err := raidClub(ctx, tx, "Multiplier A")
		if err != nil {
			return err
		}
		b, err := raidClub(ctx, tx, "Multiplier B")
		if err != nil {
			return err
		}
		// Both clubs sit in Silver I (Standing 1000 → x1.25 league multiplier).
		setClubEconomy(t, ctx, tx, a, 0, 0, 0, 1000)
		setClubEconomy(t, ctx, tx, b, 100000, 1000, 100, 1000)

		repo := NewRepository(tx).WithSimulator(fakeSim(3, 0, 70, 2.5, 0.4))
		ref, err := repo.QueueRaid(ctx, RaidRequest{AttackerID: a, DefenderID: b})
		if err != nil {
			return err
		}
		out, err := repo.ResolveRaid(ctx, ref.RaidID)
		if err != nil {
			return fmt.Errorf("resolve: %w", err)
		}
		// 3★ steals 50% of each holding, scaled by x1.25.
		if out.StolenCash != 62500 || out.StolenFans != 625 || out.StolenTokens != 62 {
			t.Fatalf("stolen = %.0f/%d/%d, want 62500/625/62 (multiplier applied)", out.StolenCash, out.StolenFans, out.StolenTokens)
		}
		rows := countRows(t, ctx, tx, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "Type"='raid_loot' AND "BuyerClubId"=$1`, a)
		if rows != 3 {
			t.Fatalf("attacker raid_loot ledger rows = %d, want 3 (one per currency)", rows)
		}
		// The ledger amounts carry the multiplied loot exactly once.
		for _, want := range []float64{62500, 625, 62} {
			if n := countRows(t, ctx, tx, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "Type"='raid_loot' AND "BuyerClubId"=$1 AND "Amount"=$2`, a, want); n != 1 {
				t.Errorf("ledger rows for amount %.0f = %d, want 1", want, n)
			}
		}

		// Re-resolving the same raid must not double-pay the multiplier.
		if _, err := repo.ResolveRaid(ctx, ref.RaidID); err != nil {
			return err
		}
		after := countRows(t, ctx, tx, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "Type"='raid_loot' AND "BuyerClubId"=$1`, a)
		if after != 3 {
			t.Errorf("second resolve changed ledger rows: %d -> %d", rows, after)
		}
		budget, _, _, standing, _ := clubScalars(t, ctx, tx, a)
		if budget != 62500 || standing != 1032 {
			t.Errorf("second resolve changed the club: budget=%.0f standing=%d", budget, standing)
		}
		return nil
	})
}
