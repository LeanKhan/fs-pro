package transfer

import (
	"context"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

func TestAiResponseTransitions(t *testing.T) {
	// Squad too thin -> rejected outright.
	if d, _, _ := AiResponse(10_000_000, 10_000_000, false, 10, 50, 50); d != "rejected" {
		t.Fatalf("thin squad = %q", d)
	}
	// A full-value offer is accepted (ask is value*~1.05..1.15).
	if d, _, _ := AiResponse(100_000_000, 1_000_000, false, 20, 50, 50); d != "accepted" {
		t.Fatalf("generous offer = %q", d)
	}
	// Half-value offer is far below the ask -> rejected.
	if d, _, _ := AiResponse(500_000, 1_000_000, false, 20, 50, 50); d != "rejected" {
		t.Fatalf("lowball = %q", d)
	}
	// Around 0.9x value with a random +/- -> countered (not accepted/rejected).
	seenCounter := false
	for i := 0; i < 50; i++ {
		if d, _, _ := AiResponse(1_050_000, 1_000_000, false, 20, 50, 50); d == "countered" {
			seenCounter = true
		}
	}
	if !seenCounter {
		t.Fatal("expected at least one counter")
	}
}

// TestPurchaseRolledBack exercises the atomic purchase inside a transaction
// that is always rolled back.
func TestPurchaseRolledBack(t *testing.T) {
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
		// Open the window so the purchase is allowed.
		if _, err := tx.Exec(ctx, `UPDATE "Calendars" SET "TransferWindowOpen" = true, "TransferWindowClosesDay" = NULL`); err != nil {
			return err
		}
		// A free agent with a positive value, and a buying club with budget.
		freeRow, ok, err := one(ctx, tx, `SELECT "_id","Value" FROM "Players" WHERE "isSigned" = false AND "isRetired" = false AND "Value" > 0 AND "ClubId" IS NULL ORDER BY "Value" ASC LIMIT 1`)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no free agent")
		}
		playerID := db.StringField(freeRow, "_id")
		value := floatOf(freeRow["Value"])
		clubRow, ok, err := one(ctx, tx, `SELECT "_id","Budget" FROM "Clubs" ORDER BY "Budget" DESC NULLS LAST LIMIT 1`)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no club")
		}
		clubID := db.StringField(clubRow, "_id")
		offer := value + 100000
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Budget" = $2 WHERE "_id" = $1`, clubID, offer+1); err != nil {
			return err
		}

		result, err := repo.ExecutePurchase(ctx, playerID, clubID, offer)
		if err != nil {
			t.Errorf("purchase failed: %v", err)
			return nil
		}
		if result["player"] == nil {
			t.Error("purchase returned no player")
		}
		// Player moved.
		moved, _, err := one(ctx, tx, `SELECT "ClubId" FROM "Players" WHERE "_id" = $1`, playerID)
		if err != nil {
			return err
		}
		if db.StringField(moved, "ClubId") != clubID {
			t.Error("player did not move to the buying club")
		}
		// Ledger wrote a transfer row.
		ledger, ok, err := one(ctx, tx, `SELECT "_id" FROM "TransferLedger" WHERE "Type" = 'transfer' AND "PlayerId" = $1`, playerID)
		if err != nil {
			return err
		}
		if !ok || ledger == nil {
			t.Error("no transfer ledger row")
		}
		// Budget debited.
		after, _, err := one(ctx, tx, `SELECT "Budget" FROM "Clubs" WHERE "_id" = $1`, clubID)
		if err != nil {
			return err
		}
		if floatOf(after["Budget"]) >= offer+1 {
			t.Error("buying club budget was not debited")
		}
		// Double-buy: the player now belongs to a club -> refused.
		if _, err := repo.ExecutePurchase(ctx, playerID, clubID, offer); err == nil {
			t.Error("double-buy must be rejected")
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back purchase: %v", err)
	}
}

// TestPlaceBidAtomicRolledBack is the D25 regression: the duplicate-open-bid
// check and the offer insert share one transaction, so a rejected duplicate
// leaves no partially-inserted offer behind. Fully rolled back.
func TestPlaceBidAtomicRolledBack(t *testing.T) {
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
		if _, err := tx.Exec(ctx, `UPDATE "Calendars" SET "TransferWindowOpen" = true, "TransferWindowClosesDay" = NULL`); err != nil {
			return err
		}
		// A player owned by an AI club (no user), so the bidder is answered.
		row, ok, err := one(ctx, tx, `SELECT p."_id", p."Value", p."ClubId" FROM "Players" p
			JOIN "Clubs" c ON c."_id" = p."ClubId"
			WHERE p."isRetired" = false AND p."ClubId" IS NOT NULL
			  AND c."UserId" IS NULL AND p."Value" > 0
			ORDER BY p."Value" ASC LIMIT 1`)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no AI-owned player")
		}
		playerID := db.StringField(row, "_id")
		ownerID := db.StringField(row, "ClubId")
		value := floatOf(row["Value"])
		bidderRow, ok, err := one(ctx, tx, `SELECT "_id" FROM "Clubs" WHERE "_id" <> $1 ORDER BY "Budget" DESC NULLS LAST LIMIT 1`, ownerID)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no second club")
		}
		bidderID := db.StringField(bidderRow, "_id")
		amount := value * 2
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Budget" = $2 WHERE "_id" = $1`, bidderID, amount+1_000_000); err != nil {
			return err
		}
		// Happy path: the offer insert commits (proves the atomic insert path,
		// including the non-default "updatedAt" column).
		first, err := repo.PlaceBid(ctx, playerID, bidderID, amount)
		if err != nil {
			t.Errorf("first bid: %v", err)
			return nil
		}
		if first == "" {
			t.Error("placeBid returned an empty offer id")
		}
		// Seed an already-open bid for this player from this club.
		if _, err := db.InsertRow(ctx, tx, "TransferOffers", map[string]any{
			"PlayerId": playerID, "FromClubId": bidderID, "ToClubId": ownerID,
			"Amount": amount, "Status": "pending", "Initiator": "user",
			"CreatedDay": 1, "ExpiresDay": 8, "updatedAt": time.Now(),
		}); err != nil {
			return err
		}
		countOffers := func() (int, error) {
			c, _, err := one(ctx, tx, `SELECT count(*)::int AS n FROM "TransferOffers" WHERE "FromClubId" = $1 AND "PlayerId" = $2`, bidderID, playerID)
			if err != nil {
				return 0, err
			}
			return intOf(c["n"]), nil
		}
		before, err := countOffers()
		if err != nil {
			return err
		}
		if _, err := repo.PlaceBid(ctx, playerID, bidderID, amount); err == nil {
			t.Error("a duplicate open bid must be refused")
		}
		after, err := countOffers()
		if err != nil {
			return err
		}
		if after != before {
			t.Errorf("rejected duplicate changed offer count %d -> %d", before, after)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back placeBid: %v", err)
	}
}

// TestSettlementGuardRolledBack proves the conditional settlement guard: two
// settlements of one free agent cannot both win, and exactly one ledger row is
// written. Deterministic (sequential calls) and fully rolled back.
func TestSettlementGuardRolledBack(t *testing.T) {
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
		if _, err := tx.Exec(ctx, `UPDATE "Calendars" SET "TransferWindowOpen" = true, "TransferWindowClosesDay" = NULL`); err != nil {
			return err
		}
		freeRow, ok, err := one(ctx, tx, `SELECT "_id","Value" FROM "Players" WHERE "isSigned" = false AND "isRetired" = false AND "Value" > 0 AND "ClubId" IS NULL ORDER BY "Value" ASC LIMIT 1`)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no free agent")
		}
		playerID := db.StringField(freeRow, "_id")
		amount := floatOf(freeRow["Value"]) + 100000
		clubs, err := all(ctx, tx, `SELECT "_id" FROM "Clubs" ORDER BY "Budget" DESC NULLS LAST LIMIT 2`)
		if err != nil {
			return err
		}
		if len(clubs) < 2 {
			t.Skip("need two clubs")
		}
		a := db.StringField(clubs[0], "_id")
		b := db.StringField(clubs[1], "_id")
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Budget" = $2 WHERE "_id" IN ($1, $3)`, a, amount+1, b); err != nil {
			return err
		}

		// First settlement (free agent) wins.
		if _, err := repo.settleTransfer(ctx, playerID, a, amount, "first", nil); err != nil {
			t.Errorf("first settlement failed: %v", err)
			return nil
		}
		// Second settlement of the same (now-owned) player must be refused by
		// the conditional guard, not double-charge.
		if _, err := repo.settleTransfer(ctx, playerID, b, amount, "second", nil); err == nil {
			t.Error("second settlement of an owned player must be rejected")
		}
		// Exactly one ledger row for this settlement.
		var n int
		countRow, _, err := one(ctx, tx, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "Type" = 'transfer' AND "PlayerId" = $1`, playerID)
		if err != nil {
			return err
		}
		n = intOf(countRow["n"])
		if n != 1 {
			t.Errorf("ledger rows = %d, want exactly 1", n)
		}
		// The player belongs to A only.
		moved, _, err := one(ctx, tx, `SELECT "ClubId" FROM "Players" WHERE "_id" = $1`, playerID)
		if err != nil {
			return err
		}
		if db.StringField(moved, "ClubId") != a {
			t.Errorf("player ClubId = %q, want %q", db.StringField(moved, "ClubId"), a)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back settlement guard: %v", err)
	}
}
