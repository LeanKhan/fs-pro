package transfer

import (
	"context"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

func TestImprovesSquad(t *testing.T) {
	roster := []map[string]any{{"Position": "ST", "Rating": float64(70)}, {"Position": "ST", "Rating": float64(80)}, {"Position": "GK", "Rating": float64(99)}}
	if !improvesSquad(85, "ST", roster) {
		t.Error("85 should improve a median-80 position")
	}
	if improvesSquad(75, "ST", roster) {
		t.Error("75 should not improve a median-80 position")
	}
	if !improvesSquad(10, "CM", roster) {
		t.Error("a new position is always an improvement")
	}
}

func TestListingReaction(t *testing.T) {
	if s, _, m := listingReaction(18, 60, 100000, 100000, false); s != "youth_breakout_eager" || m != "Very High" {
		t.Errorf("youth = %q/%q", s, m)
	}
	if s, _, m := listingReaction(25, 80, 100000, 120000, false); s != "unhappy_demoralized" || m != "Low" {
		t.Errorf("key player = %q/%q", s, m)
	}
	if s, _, m := listingReaction(31, 70, 100000, 100000, false); s != "accepts_professionally" || m != "Content" {
		t.Errorf("veteran = %q/%q", s, m)
	}
}

func TestVerdictRecommendation(t *testing.T) {
	cases := []struct {
		delta, share, age float64
		want              string
		conf              float64
	}{
		{3, 50, 24, "MUST_BUY", 0.70},
		{0, 70, 24, "RECOMMENDED", 0.65},
		{5, 96, 24, "HIGH_RISK", 0.55},
		{1, 90, 34, "HIGH_RISK", 0.55},
		{-2, 50, 24, "ROTATION", 0.58},
	}
	for _, c := range cases {
		got, conf := verdictRecommendation(c.delta, c.share, c.age)
		if got != c.want || conf != c.conf {
			t.Errorf("verdict(%v,%v,%v) = %q/%v, want %q/%v", c.delta, c.share, c.age, got, conf, c.want, c.conf)
		}
	}
}

func TestRequestBudgetIncreaseRolledBack(t *testing.T) {
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
		clubRow, ok, err := one(ctx, tx, `SELECT "_id" FROM "Clubs" ORDER BY "Budget" DESC NULLS LAST LIMIT 1`)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no club")
		}
		clubID := db.StringField(clubRow, "_id")
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Budget" = 100000, "BoardConfidence" = 50, "Form" = '{"recent":["W","W","D"]}'::jsonb WHERE "_id" = $1`, clubID); err != nil {
			return err
		}

		res, err := repo.RequestBudgetIncrease(ctx, clubID, 50000, "SQUAD_DEPTH")
		if err != nil {
			t.Fatalf("budget request: %v", err)
		}
		if res["source"] != "local" {
			t.Errorf("source = %v", res["source"])
		}
		if res["status"] != "COMPROMISE" {
			t.Errorf("status = %v", res["status"])
		}
		// Local fallback grants 60%.
		if got := floatOf(res["grantedAmount"]); got != 30000 {
			t.Errorf("granted = %v, want 30000", got)
		}
		if got := floatOf(res["newBudget"]); got != 130000 {
			t.Errorf("newBudget = %v, want 130000", got)
		}
		budgetRow, _, err := one(ctx, tx, `SELECT "Budget" FROM "Clubs" WHERE "_id" = $1`, clubID)
		if err != nil {
			return err
		}
		if got := floatOf(budgetRow["Budget"]); got != 130000 {
			t.Errorf("stored budget = %v, want 130000", got)
		}
		ledger, _, err := one(ctx, tx, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "Type" = 'board_grant' AND "BuyerClubId" = $1`, clubID)
		if err != nil {
			return err
		}
		if intOf(ledger["n"]) != 1 {
			t.Errorf("board_grant ledger rows = %v, want 1", ledger["n"])
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back budget request: %v", err)
	}
}

func TestListingScoutRolledBack(t *testing.T) {
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
		row, ok, err := one(ctx, tx, `SELECT "_id","ClubId" FROM "Players" WHERE "ClubId" IS NOT NULL AND "isRetired" = false LIMIT 1`)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no player")
		}
		playerID := db.StringField(row, "_id")
		clubID := db.StringField(row, "ClubId")
		if _, err := tx.Exec(ctx, `UPDATE "Calendars" SET "TransferWindowOpen" = true, "TransferWindowClosesDay" = NULL`); err != nil {
			return err
		}

		// List for sale: sets the flag and asking price.
		res, err := repo.ListPlayerForSale(ctx, playerID, clubID, true, nil)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		player, _ := res["player"].(map[string]any)
		if listed, _ := player["isTransferListed"].(bool); !listed {
			t.Error("player not marked listed")
		}
		if player["AskingPrice"] == nil {
			t.Error("asking price not set")
		}
		if reaction, _ := res["reaction"].(map[string]any); reaction["quote"] == "" || reaction["morale"] == "" {
			t.Errorf("bad reaction %v", res["reaction"])
		}

		// Unlist clears the price.
		res, err = repo.ListPlayerForSale(ctx, playerID, clubID, false, nil)
		if err != nil {
			t.Fatalf("unlist: %v", err)
		}
		player, _ = res["player"].(map[string]any)
		if listed, _ := player["isTransferListed"].(bool); listed {
			t.Error("player still listed")
		}
		if player["AskingPrice"] != nil {
			t.Error("asking price not cleared")
		}
		if res["marketInterest"] != "Player removed from the transfer list." {
			t.Errorf("unlist interest = %v", res["marketInterest"])
		}

		// A player from another club is refused.
		if _, err := repo.ListPlayerForSale(ctx, playerID, "00000000-0000-0000-0000-000000000000", true, nil); err == nil || err.Error() != "This player does not belong to your club" {
			t.Errorf("foreign player: %v", err)
		}

		// Scout report is a well-shaped local report.
		report, err := repo.ScoutPlayerTransfer(ctx, playerID, clubID)
		if err != nil {
			t.Fatalf("scout: %v", err)
		}
		if report["source"] != "local" {
			t.Errorf("source = %v", report["source"])
		}
		switch report["recommendation"] {
		case "MUST_BUY", "RECOMMENDED", "ROTATION", "OVERPRICED", "HIGH_RISK":
		default:
			t.Errorf("recommendation = %v", report["recommendation"])
		}
		if _, ok := report["confidence"].(int); !ok {
			t.Errorf("confidence type = %T", report["confidence"])
		}
		cmp, _ := report["comparisonWithSquad"].(map[string]any)
		if cmp == nil {
			t.Fatal("missing comparisonWithSquad")
		}
		for _, key := range []string{"currentBestRating", "ratingDelta", "samePositionCount"} {
			if _, present := cmp[key]; !present {
				t.Errorf("comparisonWithSquad missing %q", key)
			}
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back transfers: %v", err)
	}
}
