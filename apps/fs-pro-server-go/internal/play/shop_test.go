package play

import (
	"context"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

func TestShopStateMath(t *testing.T) {
	// Never collected -> a full till.
	full := shopState(100, 5000, 0, false, 1000)
	if full["pending"].(int) != 5000 || full["cap"].(int) != 5000 {
		t.Errorf("full till = %v", full)
	}
	// Half an hour at 100/hour = 50.
	half := shopState(100, 5000, 0, true, 1_800_000)
	if half["pending"].(int) != 50 {
		t.Errorf("half hour = %v", half["pending"])
	}
	if half["secondsToFull"].(int) <= 0 {
		t.Errorf("secondsToFull = %v", half["secondsToFull"])
	}
}

func TestCollectShopRolledBack(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	pool, err := db.New(context.Background(), url, 15*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()
	ctx := context.Background()

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)
		row, ok, err := repo.one(ctx, `SELECT "_id" FROM "Clubs" ORDER BY "Budget" DESC NULLS LAST LIMIT 1`)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no club")
		}
		clubID := db.StringField(row, "_id")
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Budget" = 1000, "Finances" = NULL WHERE "_id" = $1`, clubID); err != nil {
			return err
		}
		result, err := repo.CollectShop(ctx, clubID)
		if err != nil {
			t.Fatalf("collect: %v", err)
		}
		cap := intOf(result["shop"].(map[string]any)["cap"])
		collected := intOf(result["collected"])
		// A never-collected club banks a full till.
		if collected != cap || collected <= 0 {
			t.Errorf("collected = %v, want the full cap %v", collected, cap)
		}
		if budget := intOf(result["budget"]); budget != 1000+collected {
			t.Errorf("budget = %v, want %v", budget, 1000+collected)
		}
		if pending := intOf(result["shop"].(map[string]any)["pending"]); pending != 0 {
			t.Errorf("till after collect = %v", pending)
		}
		if n := countLedger(ctx, tx, clubID); n != 1 {
			t.Errorf("shop_income ledger rows = %d", n)
		}
		// A second collect immediately only earns the few ms since the first -
		// the guarded update never re-pays the banked till.
		second, err := repo.CollectShop(ctx, clubID)
		if err != nil {
			t.Fatalf("second collect: %v", err)
		}
		if got := intOf(second["collected"]); got >= collected {
			t.Errorf("second collect re-paid the till: %v (first %v)", got, collected)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back collect: %v", err)
	}
}

func countLedger(ctx context.Context, q db.Querier, clubID string) int {
	rows, err := q.Query(ctx, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "Type" = 'shop_income' AND "BuyerClubId" = $1`, clubID)
	if err != nil {
		return -1
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return -1
	}
	return intOf(m["n"])
}
