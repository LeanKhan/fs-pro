package program

import (
	"context"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

func TestMaskRange(t *testing.T) {
	if lo, hi := MaskRange(50, 6, 40, 90); lo != 44 || hi != 56 {
		t.Fatalf("maskRange(50) = %d..%d", lo, hi)
	}
	if lo, _ := MaskRange(42, 6, 40, 90); lo != 40 {
		t.Fatalf("maskRange low clamp = %d", lo)
	}
	if _, hi := MaskRange(88, 6, 40, 90); hi != 90 {
		t.Fatalf("maskRange high clamp = %d", hi)
	}
}

func TestManagerFeeAndWage(t *testing.T) {
	if ManagerFee(76) != 2000000 || ManagerFee(58) != 180000 || ManagerFee(40) != 40000 {
		t.Fatal("managerFee tiers wrong")
	}
	if ManagerWage(76) != 100000 || ManagerWage(58) != 9000 {
		t.Fatal("managerWage tiers wrong")
	}
	if ManagerOverall(60, 60, 60, 60) != 60 {
		t.Fatalf("managerOverall(60s) = %d", ManagerOverall(60, 60, 60, 60))
	}
}

func TestEffectiveManagerFee(t *testing.T) {
	if EffectiveManagerFee(1000000, false) != 1000000 {
		t.Fatal("no negotiation should keep the fee")
	}
	if EffectiveManagerFee(1000000, true) != 900000 {
		t.Fatalf("interviewed fee = %d, want 900000", EffectiveManagerFee(1000000, true))
	}
}

// TestMarketRolledBack exercises the money-writing market inside a transaction
// that is always rolled back, so the DB is never left changed.
func TestMarketRolledBack(t *testing.T) {
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

	err = db.InRollback(ctx, pool, func(tx db.Querier) error {
		clubRow, ok, err := one(ctx, tx, `SELECT "_id","Budget","ManagerId" FROM "Clubs" WHERE "ManagerId" IS NULL ORDER BY "Budget" DESC NULLS LAST LIMIT 1`)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no managerless club")
		}
		clubID := db.StringField(clubRow, "_id")
		managers, err := all(ctx, tx, `SELECT "_id" FROM "Managers" WHERE "isEmployed" = false AND "ClubId" IS NULL LIMIT 2`)
		if err != nil {
			return err
		}
		if len(managers) < 2 {
			t.Skip("fewer than two free managers")
		}
		m1 := db.StringField(managers[0], "_id")
		m2 := db.StringField(managers[1], "_id")

		// Force an unaffordable club, then prove the guarded debit rejects it.
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Budget" = 0 WHERE "_id" = $1`, clubID); err != nil {
			return err
		}
		if _, err := SignManager(ctx, tx, clubID, m1, 3); err == nil {
			t.Error("signing with 0 budget must be rejected")
		}
		// Give it budget and sign for real.
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Budget" = 5000000 WHERE "_id" = $1`, clubID); err != nil {
			return err
		}
		paid, err := SignManager(ctx, tx, clubID, m1, 3)
		if err != nil {
			t.Errorf("sign failed: %v", err)
			return nil
		}
		if paid <= 0 {
			t.Errorf("paid = %d", paid)
		}
		// Double-sign: the club now has a manager.
		if _, err := SignManager(ctx, tx, clubID, m2, 3); err == nil {
			t.Error("a second manager sign must be rejected")
		}
		// Release returns the manager to the pool.
		if err := ReleaseManager(ctx, tx, clubID, m1); err != nil {
			t.Errorf("release failed: %v", err)
		}
		free, _, err := one(ctx, tx, `SELECT "_id" FROM "Managers" WHERE "_id" = $1 AND "isEmployed" = false AND "ClubId" IS NULL`, m1)
		if err != nil {
			return err
		}
		if free == nil {
			t.Error("released manager should be back in the pool")
		}
		return nil
	})
	if err != nil {
		t.Fatalf("rolled-back market test: %v", err)
	}
}
