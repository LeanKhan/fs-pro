package clubhouse

import (
	"context"
	"time"

	"fs-pro-server/internal/db"
)

// CountGroundskeepers reads the club's effective Groundskeeper count - the one
// crew read (04 §2). It never returns below the milestone grant its Clubhouse
// tier earned, nor above MaxGroundskeepers.
func CountGroundskeepers(ctx context.Context, q db.Querier, clubID string, tier int) (int, error) {
	rows, err := q.Query(ctx, `SELECT "Count" FROM "ClubGroundskeepers" WHERE "ClubId" = $1 LIMIT 1`, clubID)
	if err != nil {
		return EffectiveGroundskeepers(0, tier), err
	}
	row, ok, err := db.ScanOne(rows)
	if err != nil {
		return EffectiveGroundskeepers(0, tier), err
	}
	stored := 0
	if ok {
		stored = intOf(row["Count"])
	}
	return EffectiveGroundskeepers(stored, tier), nil
}

// SyncTier promotes Clubs.ClubhouseTier to the clubhouse asset's level - the one
// canonical tier sync (04 §1.1). It is monotonic: a stale/lower asset level can
// never demote a tier.
func SyncTier(ctx context.Context, q db.Querier) error {
	_, err := q.Exec(ctx, `UPDATE "Clubs" c
		SET "ClubhouseTier" = ca."Level", "updatedAt" = now()
		FROM "ClubAssets" ca
		WHERE ca."ClubId" = c."_id" AND ca."AssetType" = 'clubhouse' AND ca."Level" > c."ClubhouseTier"`)
	return err
}

// SweepDueUpgrades promotes every due ClubAssets upgrade atomically and
// idempotently, then syncs the Clubhouse tier. A double call promotes nothing
// the second time (the WHERE clears UpgradingTo), so it is safe under a
// crashed-and-retried tick. It is the single completion path shared by
// internal/campus (read + StartUpgrade) and internal/facilities
// (CompleteDueUpgrades) and the world-worker builder ticker.
func SweepDueUpgrades(ctx context.Context, q db.Querier, now time.Time) (int64, error) {
	tag, err := q.Exec(ctx, `UPDATE "ClubAssets"
		SET "Level" = "UpgradingTo", "UpgradingTo" = NULL, "StartAt" = NULL, "CompleteAt" = NULL, "updatedAt" = now()
		WHERE "UpgradingTo" IS NOT NULL AND "CompleteAt" <= $1`, now)
	if err != nil {
		return 0, err
	}
	promoted := tag.RowsAffected()
	if promoted == 0 {
		// Nothing completed, so no Clubhouse tier can have moved: skip the sync
		// UPDATE (a round trip the campus read path runs on every request).
		return 0, nil
	}
	if err := SyncTier(ctx, q); err != nil {
		return promoted, err
	}
	// A finished building lifts the assets it absorbed (buildings.go).
	if err := SyncLinked(ctx, q, ""); err != nil {
		return promoted, err
	}
	return promoted, nil
}

func intOf(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int32:
		return int(n)
	case int64:
		return int(n)
	case float64:
		return int(n)
	case float32:
		return int(n)
	default:
		return 0
	}
}
