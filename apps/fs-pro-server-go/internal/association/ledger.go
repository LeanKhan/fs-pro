package association

import (
	"context"
	"math"

	"fs-pro-server/internal/db"
)

// This file holds the transactional economy primitives the association
// mutations share: a TransferLedger write plus guarded club balance updates.
// Every currency change goes through here so no association action can move
// value without a ledger row (docs/coc-mapping/04 §10).

// writeLedger inserts one TransferLedger row. Missing uuid columns are passed
// as nil (SQL NULL).
func writeLedger(ctx context.Context, q db.Querier, typ, buyerClubID, sellerClubID, playerID string, amount float64, note string) error {
	_, err := q.Exec(ctx, `INSERT INTO "TransferLedger" ("Type", "BuyerClubId", "SellerClubId", "PlayerId", "Amount", "Note", "updatedAt")
		VALUES ($1, $2, $3, $4, $5, $6, now())`,
		typ, nullString(buyerClubID), nullString(sellerClubID), nullString(playerID), amount, note)
	return err
}

// debitCash subtracts Cash (Clubs.Budget) with a guarded UPDATE so a racing
// request cannot overdraw.
func debitCash(ctx context.Context, q db.Querier, clubID string, amount float64) error {
	if amount <= 0 {
		return ErrInvalidInput
	}
	tag, err := q.Exec(ctx, `UPDATE "Clubs" SET "Budget" = coalesce("Budget", 0) - $2, "updatedAt" = now()
		WHERE "_id" = $1 AND coalesce("Budget", 0) >= $2`, clubID, amount)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInsufficientFunds
	}
	return nil
}

// creditCash adds Cash to a club.
func creditCash(ctx context.Context, q db.Querier, clubID string, amount float64) error {
	if amount <= 0 {
		return nil
	}
	_, err := q.Exec(ctx, `UPDATE "Clubs" SET "Budget" = coalesce("Budget", 0) + $2, "updatedAt" = now()
		WHERE "_id" = $1`, clubID, amount)
	return err
}

// creditFans adds Fans to a club.
func creditFans(ctx context.Context, q db.Querier, clubID string, amount int) error {
	if amount <= 0 {
		return nil
	}
	_, err := q.Exec(ctx, `UPDATE "Clubs" SET "Fans" = coalesce("Fans", 0) + $2, "updatedAt" = now()
		WHERE "_id" = $1`, clubID, int64(amount))
	return err
}

// creditBoardVault adds protected loot to a club's Board Vault (04 §5.2).
func creditBoardVault(ctx context.Context, q db.Querier, clubID string, amount float64) error {
	if amount <= 0 {
		return nil
	}
	_, err := q.Exec(ctx, `INSERT INTO "BoardVault" ("ClubId", "Balance", "updatedAt")
		VALUES ($1, $2, now())
		ON CONFLICT ("ClubId") DO UPDATE SET "Balance" = "BoardVault"."Balance" + EXCLUDED."Balance", "updatedAt" = now()`,
		clubID, amount)
	return err
}

func round(v float64) float64 { return math.Round(v) }
