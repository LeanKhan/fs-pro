package campus

import (
	"context"
	"fmt"
	"sort"
	"time"

	"fs-pro-server/internal/db"
)

// This file holds the Board-Perk inventory write (GrantPerks, called by the
// season/legacy/association reward paths) and the non-resource perk effects
// (Construction and Research against a real ClubAssets upgrade). The redemption
// entry point is Repository.UsePerk (repository.go); everything here is
// transactional and validated against real state.

// ---------------------------------------------------------------------------
// Grants.
// ---------------------------------------------------------------------------

// GrantPerks credits a set of Board Perks into the club's Clubs.Perks inventory
// (04 §7, §10). It is additive, validated and ledgered, and it is idempotent by
// construction: every caller runs it inside the transaction whose guarded claim
// row (SeasonClaims / Honours / DirectiveProgress) has already been inserted, so
// a retried reward cannot grant twice. An unknown perk key is refused and aborts
// the caller's transaction.
func GrantPerks(ctx context.Context, q db.Querier, clubID string, perks map[string]int) error {
	for _, key := range sortedPerks(perks) {
		def, ok := PerkDefFor(key)
		if !ok {
			return fmt.Errorf("%w: %s", ErrUnknownPerk, key)
		}
		count := perks[key]
		if count <= 0 {
			continue
		}
		// Additive, guarded counter bump: the key is created on first grant and
		// the previous count is never lost.
		if _, err := q.Exec(ctx, `UPDATE "Clubs"
			SET "Perks" = jsonb_set(coalesce("Perks", '{}'::jsonb), ARRAY[$2],
			        to_jsonb(coalesce(("Perks"->>$2)::int, 0) + $3::int)),
			    "updatedAt" = now()
			WHERE "_id" = $1`, clubID, def.Key, count); err != nil {
			return err
		}
		if err := ledger(ctx, q, clubID, "perk_grant", float64(count), "Board Perk "+def.Key); err != nil {
			return err
		}
	}
	return nil
}

func sortedPerks(m map[string]int) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// ---------------------------------------------------------------------------
// Effects (Construction / Research).
// ---------------------------------------------------------------------------

// validatePerkTarget rejects a missing or out-of-scope target before any state
// changes, so an invalid request never consumes the perk. Only Construction and
// Research need a target; the other kinds ignore it.
func validatePerkTarget(def PerkDef, target string) error {
	switch def.Kind {
	case PerkConstruction:
		if target == "" {
			return ErrPerkTargetRequired
		}
		if _, ok := FacilityDefFor(target); !ok {
			return fmt.Errorf("%w: %s", ErrPerkTargetInvalid, target)
		}
	case PerkResearch:
		if target == "" {
			return ErrPerkTargetRequired
		}
		if !IsResearchFacility(target) {
			return fmt.Errorf("%w: %s", ErrPerkTargetInvalid, target)
		}
	}
	return nil
}

// applyPerkEffect applies a non-resource redemption to real state (04 §7). It
// runs only after the guarded decrement, inside the caller's transaction, so a
// failure rolls the whole redemption back and it can be retried. Construction
// and Research finish/accelerate a running upgrade; Combat and Cosmetic are
// recorded no-ops (the perk_use ledger row is the record).
func applyPerkEffect(ctx context.Context, q db.Querier, clubID string, def PerkDef, target string, now time.Time) error {
	switch def.Kind {
	case PerkConstruction, PerkResearch:
		if def.Minutes > 0 {
			return accelerateUpgrade(ctx, q, clubID, target, def.Minutes, now)
		}
		return finishUpgradeNow(ctx, q, clubID, target)
	case PerkCombat, PerkCosmetic:
		return nil
	default:
		return fmt.Errorf("%w: %s", ErrUnknownPerk, def.Key)
	}
}

// finishUpgradeNow promotes the target's in-progress upgrade immediately and
// syncs Clubs.ClubhouseTier when the Clubhouse itself completes (matching
// SweepDueUpgrades). A target with no running upgrade is refused.
func finishUpgradeNow(ctx context.Context, q db.Querier, clubID, target string) error {
	tag, err := q.Exec(ctx, `UPDATE "ClubAssets"
		SET "Level" = "UpgradingTo", "UpgradingTo" = NULL, "StartAt" = NULL, "CompleteAt" = NULL, "updatedAt" = now()
		WHERE "ClubId" = $1 AND "AssetType" = $2 AND "UpgradingTo" IS NOT NULL`, clubID, target)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("%w: %s", ErrPerkTargetNotUpgrading, target)
	}
	if target == "clubhouse" {
		if _, err := q.Exec(ctx, `UPDATE "Clubs" c
			SET "ClubhouseTier" = ca."Level", "updatedAt" = now()
			FROM "ClubAssets" ca
			WHERE ca."ClubId" = c."_id" AND ca."AssetType" = 'clubhouse' AND ca."Level" > c."ClubhouseTier"`); err != nil {
			return err
		}
	}
	return nil
}

// accelerateUpgrade removes `minutes` of real-clock build time from the target's
// running upgrade. When that lands at or before `now` the upgrade finishes
// immediately; otherwise CompleteAt moves earlier and the normal sweep promotes
// it. A target with no running upgrade is refused.
func accelerateUpgrade(ctx context.Context, q db.Querier, clubID, target string, minutes float64, now time.Time) error {
	row, ok, err := dbScanOne(ctx, q, `SELECT "CompleteAt" FROM "ClubAssets"
		WHERE "ClubId" = $1 AND "AssetType" = $2 AND "UpgradingTo" IS NOT NULL`, clubID, target)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("%w: %s", ErrPerkTargetNotUpgrading, target)
	}
	complete := parseTime(db.StringField(row, "CompleteAt"))
	if complete.IsZero() || !complete.Add(-time.Duration(minutes*float64(time.Minute))).After(now) {
		return finishUpgradeNow(ctx, q, clubID, target)
	}
	if _, err := q.Exec(ctx, `UPDATE "ClubAssets"
		SET "CompleteAt" = "CompleteAt" - make_interval(secs => $3), "updatedAt" = now()
		WHERE "ClubId" = $1 AND "AssetType" = $2 AND "UpgradingTo" IS NOT NULL`,
		clubID, target, minutes*60); err != nil {
		return err
	}
	return nil
}
