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

		res, err := repo.UsePerk(ctx, club, "cash_cache", "inst-1", now)
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
		res, err = repo.UsePerk(ctx, club, "fan_cache", "inst-2", now)
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

		if _, err := repo.UsePerk(ctx, club, "cash_cache", "same-instance", now); err != nil {
			return err
		}
		budget1 := floatOf(mustClubRow(t, ctx, tx, club)["Budget"])
		ledger1 := ledgerCount(t, ctx, tx, club, "perk_use")

		res, err := repo.UsePerk(ctx, club, "cash_cache", "same-instance", now)
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

		if _, err := repo.UsePerk(ctx, club, "not_a_perk", "", now); !errors.Is(err, ErrUnknownPerk) {
			t.Errorf("unknown perk err = %v, want ErrUnknownPerk", err)
		}
		if _, err := repo.UsePerk(ctx, club, "cash_cache", "", now); !errors.Is(err, ErrPerkUnavailable) {
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
