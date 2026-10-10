package campus

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

// Perk redemption (04 §7, §10). The consume path is transactional, ledgered and
// idempotent per perk instance. Every mutation runs inside db.InRollback.

func campusPool(t *testing.T) (*db.Pool, context.Context, func(func(db.Querier) error)) {
	t.Helper()
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
	return pool, ctx, func(fn func(db.Querier) error) {
		if err := db.InRollback(ctx, pool, fn); err != nil {
			t.Fatalf("rolled-back tx: %v", err)
		}
	}
}

func perkCount(t *testing.T, ctx context.Context, q db.Querier, clubID, key string) int {
	t.Helper()
	row := mustClubRow(t, ctx, q, clubID)
	perks, _ := row["Perks"].(map[string]any)
	return PerkCount(perks, key)
}

// TestUsePerkRolledBack proves a redemption decrements the counter, credits the
// perk's currency and writes exactly one perk_use ledger row.
func TestUsePerkRolledBack(t *testing.T) {
	_, ctx, inRollback := campusPool(t)
	inRollback(func(tx db.Querier) error {
		repo := NewRepository(tx)
		club := newTestClub(t, ctx, tx, map[string]any{"Budget": 1000.0, "Fans": 0})
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Perks" = '{"cash_cache":2,"fan_cache":1}'::jsonb WHERE "_id"=$1`, club); err != nil {
			return err
		}
		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

		res, err := repo.UsePerk(ctx, club, "cash_cache", "inst-1", "", now)
		if err != nil {
			return err
		}
		if res["applied"] != true || numResult(res["granted"]) != 250000 || intOf(res["remaining"]) != 1 {
			t.Errorf("cash_cache result = %#v", res)
		}
		if got := floatOf(mustClubRow(t, ctx, tx, club)["Budget"]); got != 251000 {
			t.Errorf("budget = %v, want 251000", got)
		}
		if n := ledgerCount(t, ctx, tx, club, "perk_use"); n != 1 {
			t.Errorf("perk_use ledger rows = %d, want 1", n)
		}
		if got := perkCount(t, ctx, tx, club, "cash_cache"); got != 1 {
			t.Errorf("cash_cache counter = %d, want 1", got)
		}

		// A different perk credits its own currency.
		res, err = repo.UsePerk(ctx, club, "fan_cache", "inst-2", "", now)
		if err != nil {
			return err
		}
		if intOf(res["remaining"]) != 0 || intOf(mustClubRow(t, ctx, tx, club)["Fans"]) != 250000 {
			t.Errorf("fan_cache result = %#v", res)
		}
		return nil
	})
}

// TestUsePerkIdempotentPerInstanceRolledBack proves a replayed instanceId is a
// no-op: the counter, the currency and the ledger do not move again.
func TestUsePerkIdempotentPerInstanceRolledBack(t *testing.T) {
	_, ctx, inRollback := campusPool(t)
	inRollback(func(tx db.Querier) error {
		repo := NewRepository(tx)
		club := newTestClub(t, ctx, tx, map[string]any{"Budget": 0.0})
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Perks" = '{"cash_cache":1}'::jsonb WHERE "_id"=$1`, club); err != nil {
			return err
		}
		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

		if _, err := repo.UsePerk(ctx, club, "cash_cache", "same-instance", "", now); err != nil {
			return err
		}
		budget1 := floatOf(mustClubRow(t, ctx, tx, club)["Budget"])
		ledger1 := ledgerCount(t, ctx, tx, club, "perk_use")

		res, err := repo.UsePerk(ctx, club, "cash_cache", "same-instance", "", now)
		if err != nil {
			return err
		}
		if res["applied"] != false {
			t.Errorf("replayed redemption applied again: %#v", res)
		}
		if got := perkCount(t, ctx, tx, club, "cash_cache"); got != 0 {
			t.Errorf("counter = %d, want 0 (no second decrement)", got)
		}
		if budget2 := floatOf(mustClubRow(t, ctx, tx, club)["Budget"]); budget2 != budget1 {
			t.Errorf("budget moved on replay: %v -> %v", budget1, budget2)
		}
		if ledger2 := ledgerCount(t, ctx, tx, club, "perk_use"); ledger2 != ledger1 {
			t.Errorf("ledger grew on replay: %d -> %d", ledger1, ledger2)
		}
		return nil
	})
}

// TestUsePerkRefusalsRolledBack proves an unknown perk is rejected, an empty
// counter is refused and neither changes any state.
func TestUsePerkRefusalsRolledBack(t *testing.T) {
	_, ctx, inRollback := campusPool(t)
	inRollback(func(tx db.Querier) error {
		repo := NewRepository(tx)
		club := newTestClub(t, ctx, tx, map[string]any{"Budget": 500.0})
		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

		if _, err := repo.UsePerk(ctx, club, "not_a_perk", "", "", now); !errors.Is(err, ErrUnknownPerk) {
			t.Errorf("unknown perk err = %v, want ErrUnknownPerk", err)
		}
		if _, err := repo.UsePerk(ctx, club, "cash_cache", "", "", now); !errors.Is(err, ErrPerkUnavailable) {
			t.Errorf("empty counter err = %v, want ErrPerkUnavailable", err)
		}
		if got := floatOf(mustClubRow(t, ctx, tx, club)["Budget"]); got != 500 {
			t.Errorf("a refused redemption changed the budget: %v", got)
		}
		if n := ledgerCount(t, ctx, tx, club, "perk_use"); n != 0 {
			t.Errorf("a refused redemption wrote %d ledger rows", n)
		}
		return nil
	})
}

// TestCampusReadExposesPerksRolledBack proves campus.get surfaces the Board
// Perks counter list.
func TestCampusReadExposesPerksRolledBack(t *testing.T) {
	_, ctx, inRollback := campusPool(t)
	inRollback(func(tx db.Querier) error {
		repo := NewRepository(tx)
		club := newTestClub(t, ctx, tx, map[string]any{"Budget": 0.0})
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Perks" = '{"cash_cache":3}'::jsonb WHERE "_id"=$1`, club); err != nil {
			return err
		}
		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
		state, ok, err := repo.BuildState(ctx, club, now, 1)
		if err != nil || !ok {
			return err
		}
		list, _ := state["perks"].([]any)
		if len(list) != len(Perks) {
			t.Fatalf("perks = %d, want %d", len(list), len(Perks))
		}
		got := map[string]int{}
		for _, v := range list {
			m, _ := v.(map[string]any)
			got[db.StringField(m, "key")] = intOf(m["count"])
		}
		if got["cash_cache"] != 3 || got["fan_cache"] != 0 || got["talent_cache"] != 0 {
			t.Errorf("perk counts = %#v, want cash_cache 3 and the rest 0", got)
		}
		return nil
	})
}

// TestConstructionPerkFinishesUpgradeRolledBack proves a Construction perk
// instant-finishes a running campus upgrade, is ledgered, and is idempotent per
// perk instance (a replay applies nothing twice).
func TestConstructionPerkFinishesUpgradeRolledBack(t *testing.T) {
	_, ctx, inRollback := campusPool(t)
	inRollback(func(tx db.Querier) error {
		repo := NewRepository(tx)
		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
		club := newTestClub(t, ctx, tx, map[string]any{"Budget": 0.0, "ClubhouseTier": 3})
		if _, err := tx.Exec(ctx, `INSERT INTO "ClubAssets" ("ClubId","AssetType","Level","UpgradingTo","StartAt","CompleteAt","updatedAt")
			VALUES ($1,'turnstiles',1,2,$2,$3,now())`, club, now, now.Add(time.Hour)); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Perks" = '{"instant_finish":1}'::jsonb WHERE "_id"=$1`, club); err != nil {
			return err
		}

		res, err := repo.UsePerk(ctx, club, "instant_finish", "ci-1", "turnstiles", now)
		if err != nil {
			return err
		}
		if res["applied"] != true || res["kind"] != string(PerkConstruction) || intOf(res["remaining"]) != 0 {
			t.Errorf("instant_finish result = %#v", res)
		}
		assets := mustAssets(t, ctx, tx, club)
		if intOf(assets["turnstiles"]["Level"]) != 2 || assets["turnstiles"]["UpgradingTo"] != nil {
			t.Errorf("turnstiles not finished: %+v", assets["turnstiles"])
		}
		if n := ledgerCount(t, ctx, tx, club, "perk_use"); n != 1 {
			t.Errorf("perk_use ledger rows = %d, want 1", n)
		}

		// A replayed instance applies nothing and writes no second ledger row.
		res, err = repo.UsePerk(ctx, club, "instant_finish", "ci-1", "turnstiles", now)
		if err != nil {
			return err
		}
		if res["applied"] != false || intOf(res["remaining"]) != 0 {
			t.Errorf("replayed instant_finish = %#v", res)
		}
		if n := ledgerCount(t, ctx, tx, club, "perk_use"); n != 1 {
			t.Errorf("replay wrote a perk_use ledger row (%d)", n)
		}
		return nil
	})
}

// TestResearchPerkTargetingRolledBack proves a Research perk only finishes a
// Coaching/Video upgrade: a missing target is refused, a non-research target is
// refused, and a running research upgrade is finished.
func TestResearchPerkTargetingRolledBack(t *testing.T) {
	_, ctx, inRollback := campusPool(t)
	inRollback(func(tx db.Querier) error {
		repo := NewRepository(tx)
		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
		club := newTestClub(t, ctx, tx, map[string]any{"Fans": 0, "ClubhouseTier": 4})
		if _, err := tx.Exec(ctx, `INSERT INTO "ClubAssets" ("ClubId","AssetType","Level","UpgradingTo","StartAt","CompleteAt","updatedAt")
			VALUES ($1,'coaching_dept',1,2,$2,$3,now())`, club, now, now.Add(time.Hour)); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Perks" = '{"research_finish":1}'::jsonb WHERE "_id"=$1`, club); err != nil {
			return err
		}

		if _, err := repo.UsePerk(ctx, club, "research_finish", "r-0", "", now); !errors.Is(err, ErrPerkTargetRequired) {
			t.Errorf("missing target err = %v, want ErrPerkTargetRequired", err)
		}
		if _, err := repo.UsePerk(ctx, club, "research_finish", "r-1", "turnstiles", now); !errors.Is(err, ErrPerkTargetInvalid) {
			t.Errorf("non-research target err = %v, want ErrPerkTargetInvalid", err)
		}
		if got := perkCount(t, ctx, tx, club, "research_finish"); got != 1 {
			t.Errorf("a refused research redemption consumed the perk: %d", got)
		}

		res, err := repo.UsePerk(ctx, club, "research_finish", "r-2", "coaching_dept", now)
		if err != nil {
			return err
		}
		if res["applied"] != true || res["kind"] != string(PerkResearch) {
			t.Errorf("research_finish result = %#v", res)
		}
		if assets := mustAssets(t, ctx, tx, club); intOf(assets["coaching_dept"]["Level"]) != 2 || assets["coaching_dept"]["UpgradingTo"] != nil {
			t.Errorf("coaching_dept not finished: %+v", assets["coaching_dept"])
		}

		// Replaying the instance after the target finished is a no-op success
		// (the guard short-circuits before the state check), not a 409.
		res, err = repo.UsePerk(ctx, club, "research_finish", "r-2", "coaching_dept", now)
		if err != nil {
			return err
		}
		if res["applied"] != false {
			t.Errorf("replayed research_finish applied again: %#v", res)
		}
		if n := ledgerCount(t, ctx, tx, club, "perk_use"); n != 1 {
			t.Errorf("replay wrote a perk_use ledger row (%d)", n)
		}
		return nil
	})
}

// TestBuilderBoostAcceleratesRolledBack proves a Builder Boost removes build
// time, and finishes the upgrade immediately when the boost covers the
// remainder.
func TestBuilderBoostAcceleratesRolledBack(t *testing.T) {
	_, ctx, inRollback := campusPool(t)
	inRollback(func(tx db.Querier) error {
		repo := NewRepository(tx)
		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

		// A long upgrade is accelerated by one hour.
		longClub := newTestClub(t, ctx, tx, map[string]any{"Budget": 0.0, "ClubhouseTier": 3})
		if _, err := tx.Exec(ctx, `INSERT INTO "ClubAssets" ("ClubId","AssetType","Level","UpgradingTo","StartAt","CompleteAt","updatedAt")
			VALUES ($1,'club_shop',1,2,$2,$3,now())`, longClub, now, now.Add(3*time.Hour)); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Perks" = '{"builder_boost":2}'::jsonb WHERE "_id"=$1`, longClub); err != nil {
			return err
		}
		if _, err := repo.UsePerk(ctx, longClub, "builder_boost", "b-1", "club_shop", now); err != nil {
			return err
		}
		row := mustAssets(t, ctx, tx, longClub)["club_shop"]
		if got, want := parseTime(db.StringField(row, "CompleteAt")), now.Add(2*time.Hour); !got.Equal(want) {
			t.Errorf("boosted CompleteAt = %v, want %v", got, want)
		}
		if intOf(row["Level"]) != 1 || row["UpgradingTo"] == nil {
			t.Errorf("the accelerated upgrade must stay in progress: %+v", row)
		}
		// Replaying the boost instance moves nothing.
		res, err := repo.UsePerk(ctx, longClub, "builder_boost", "b-1", "club_shop", now)
		if err != nil {
			return err
		}
		if res["applied"] != false {
			t.Errorf("replayed builder_boost applied again: %#v", res)
		}
		row = mustAssets(t, ctx, tx, longClub)["club_shop"]
		if got, want := parseTime(db.StringField(row, "CompleteAt")), now.Add(2*time.Hour); !got.Equal(want) {
			t.Errorf("replay moved the accelerated CompleteAt: %v, want %v", got, want)
		}

		// A short upgrade whose remainder the boost covers completes now.
		shortClub := newTestClub(t, ctx, tx, map[string]any{"Budget": 0.0, "ClubhouseTier": 3})
		if _, err := tx.Exec(ctx, `INSERT INTO "ClubAssets" ("ClubId","AssetType","Level","UpgradingTo","StartAt","CompleteAt","updatedAt")
			VALUES ($1,'fan_vault',1,2,$2,$3,now())`, shortClub, now, now.Add(30*time.Minute)); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Perks" = '{"builder_boost":1}'::jsonb WHERE "_id"=$1`, shortClub); err != nil {
			return err
		}
		if _, err := repo.UsePerk(ctx, shortClub, "builder_boost", "b-2", "fan_vault", now); err != nil {
			return err
		}
		row = mustAssets(t, ctx, tx, shortClub)["fan_vault"]
		if intOf(row["Level"]) != 2 || row["UpgradingTo"] != nil {
			t.Errorf("a covered boost must finish the upgrade: %+v", row)
		}

		// A target with no running upgrade is refused.
		emptyClub := newTestClub(t, ctx, tx, map[string]any{"ClubhouseTier": 3})
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Perks" = '{"builder_boost":1}'::jsonb WHERE "_id"=$1`, emptyClub); err != nil {
			return err
		}
		if _, err := repo.UsePerk(ctx, emptyClub, "builder_boost", "b-3", "club_shop", now); !errors.Is(err, ErrPerkTargetNotUpgrading) {
			t.Errorf("no-upgrade target err = %v, want ErrPerkTargetNotUpgrading", err)
		}
		return nil
	})
}

// TestCombatCosmeticPerksAreRecordedNoOpsRolledBack proves Combat/Cosmetic perks
// are redeemable (consumed + ledgered) but move no currency or upgrade state.
func TestCombatCosmeticPerksAreRecordedNoOpsRolledBack(t *testing.T) {
	_, ctx, inRollback := campusPool(t)
	inRollback(func(tx db.Querier) error {
		repo := NewRepository(tx)
		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
		club := newTestClub(t, ctx, tx, map[string]any{"Budget": 123.0, "Fans": 7})
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Perks" = '{"trait_trial":1,"regalia":1}'::jsonb WHERE "_id"=$1`, club); err != nil {
			return err
		}
		for _, perk := range []string{"trait_trial", "regalia"} {
			res, err := repo.UsePerk(ctx, club, perk, perk+"-1", "", now)
			if err != nil {
				return err
			}
			if res["applied"] != true {
				t.Errorf("%s was not applied: %#v", perk, res)
			}
		}
		row := mustClubRow(t, ctx, tx, club)
		if floatOf(row["Budget"]) != 123.0 || intOf(row["Fans"]) != 7 {
			t.Errorf("a no-op perk moved currency: %v/%v", row["Budget"], row["Fans"])
		}
		if n := ledgerCount(t, ctx, tx, club, "perk_use"); n != 2 {
			t.Errorf("perk_use ledger rows = %d, want 2", n)
		}
		return nil
	})
}

// TestGrantPerksFeedsCampusReadAndConsumeRolledBack proves the reward-path grant
// populate the same Clubs.Perks inventory the campus read exposes and
// campus.usePerk consumes.
func TestGrantPerksFeedsCampusReadAndConsumeRolledBack(t *testing.T) {
	_, ctx, inRollback := campusPool(t)
	inRollback(func(tx db.Querier) error {
		repo := NewRepository(tx)
		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
		club := newTestClub(t, ctx, tx, map[string]any{"Budget": 0.0})

		if err := GrantPerks(ctx, tx, club, map[string]int{"cash_cache": 2, "instant_finish": 1}); err != nil {
			return err
		}
		if n := ledgerCount(t, ctx, tx, club, "perk_grant"); n != 2 {
			t.Errorf("perk_grant ledger rows = %d, want 2", n)
		}
		// A second grant is additive.
		if err := GrantPerks(ctx, tx, club, map[string]int{"cash_cache": 1}); err != nil {
			return err
		}
		if got := perkCount(t, ctx, tx, club, "cash_cache"); got != 3 {
			t.Errorf("cash_cache after grants = %d, want 3", got)
		}

		// The campus read surfaces the granted inventory.
		state, ok, err := repo.BuildState(ctx, club, now, 1)
		if err != nil || !ok {
			return err
		}
		got := map[string]int{}
		for _, v := range state["perks"].([]any) {
			m, _ := v.(map[string]any)
			got[db.StringField(m, "key")] = intOf(m["count"])
		}
		if got["cash_cache"] != 3 || got["instant_finish"] != 1 {
			t.Errorf("granted inventory not exposed: %#v", got)
		}

		// And the consume path redeems it.
		if _, err := repo.UsePerk(ctx, club, "cash_cache", "g-1", "", now); err != nil {
			return err
		}
		if got := floatOf(mustClubRow(t, ctx, tx, club)["Budget"]); got != 250000 {
			t.Errorf("granted cash_cache not redeemable: budget %v", got)
		}

		// An unknown perk key is refused and grants nothing.
		if err := GrantPerks(ctx, tx, club, map[string]int{"not_a_perk": 1}); !errors.Is(err, ErrUnknownPerk) {
			t.Errorf("unknown grant err = %v, want ErrUnknownPerk", err)
		}
		return nil
	})
}

// numResult coerces a map[string]any numeric value from either a float or int.
func numResult(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return 0
	}
}
