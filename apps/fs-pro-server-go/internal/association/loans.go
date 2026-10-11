package association

import (
	"context"
	"time"

	"fs-pro-server/internal/db"
)

// Loan windows (02 §G, §B2). A loan is a cross-club temporary player: the
// player's ClubId moves to the borrowing club until the loan is returned.
const (
	DefaultLoanHours = 24
	MaxLoanHours     = 24 * 14
)

// MoveLoan sends one of a member club's players on loan to another member club.
// The whole write is one transaction: the loan row (guarded so a player cannot
// have two open loans), the player's ClubId move, and a TransferLedger row.
func (r *Repository) MoveLoan(ctx context.Context, assocID, fromClubID, playerID, toClubID string, hours int, now time.Time) (map[string]any, error) {
	if hours <= 0 {
		hours = DefaultLoanHours
	}
	if hours > MaxLoanHours {
		return nil, ErrInvalidInput
	}
	if fromClubID == "" || playerID == "" || toClubID == "" || fromClubID == toClubID {
		return nil, ErrInvalidInput
	}
	var out map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		assoc, ok, err := assocRow(ctx, tx, assocID, true)
		if err != nil {
			return err
		}
		if !ok {
			return ErrAssociationNotFound
		}
		if _, ok, err := memberRole(ctx, tx, assocID, fromClubID); err != nil {
			return err
		} else if !ok {
			return ErrNotAMember
		}
		if _, ok, err := memberRole(ctx, tx, assocID, toClubID); err != nil {
			return err
		} else if !ok {
			return ErrNotAMember
		}
		player, ok, err := scanOne(ctx, tx, `SELECT "_id", "ClubId" FROM "Players" WHERE "_id" = $1`, playerID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrPlayerNotFound
		}
		if db.StringField(player, "ClubId") != fromClubID {
			return ErrPlayerNotHere
		}
		count, _, err := scanOne(ctx, tx, `SELECT count(*)::int AS n FROM "AssociationLoans" WHERE "AssociationId" = $1 AND "ReturnedAt" IS NULL`, assocID)
		if err != nil {
			return err
		}
		if intOf(count["n"]) >= LoanSlots(intOf(assoc["Level"])) {
			return ErrLoanSlotsFull
		}
		dueAt := now.Add(time.Duration(hours) * time.Hour)
		tag, err := tx.Exec(ctx, `INSERT INTO "AssociationLoans" ("AssociationId", "PlayerId", "FromClubId", "ToClubId", "DueAt", "updatedAt")
			SELECT $1, $2, $3, $4, $5, $6
			WHERE NOT EXISTS (SELECT 1 FROM "AssociationLoans" WHERE "PlayerId" = $2 AND "ReturnedAt" IS NULL)`,
			assocID, playerID, fromClubID, toClubID, dueAt, now)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrLoanExists
		}
		tag, err = tx.Exec(ctx, `UPDATE "Players" SET "ClubId" = $2, "updatedAt" = now()
			WHERE "_id" = $1 AND "ClubId" = $3`, playerID, toClubID, fromClubID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrPlayerNotHere
		}
		row, ok, err := scanOne(ctx, tx, loanColumns+` WHERE "AssociationId" = $1 AND "PlayerId" = $2 AND "ReturnedAt" IS NULL
			ORDER BY "createdAt" DESC LIMIT 1`, assocID, playerID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrLoanNotFound
		}
		if err := writeLedger(ctx, tx, "loan", toClubID, fromClubID, playerID, 0, "Player loaned"); err != nil {
			return err
		}
		out = loanPayload(row)
		return nil
	})
	return out, err
}

// ReturnLoan ends a loan and moves the player home. It is idempotent: calling
// it again for an already-returned loan returns the same row without a second
// ledger row or a second ClubId move (the guarded UPDATE is the ledger guard).
func (r *Repository) ReturnLoan(ctx context.Context, assocID, clubID, loanID string, now time.Time) (map[string]any, error) {
	var out map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if _, ok, err := assocRow(ctx, tx, assocID, false); err != nil {
			return err
		} else if !ok {
			return ErrAssociationNotFound
		}
		row, ok, err := scanOne(ctx, tx, loanColumns+` WHERE "_id" = $1 AND "AssociationId" = $2 FOR UPDATE`, loanID, assocID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrLoanNotFound
		}
		from := db.StringField(row, "FromClubId")
		to := db.StringField(row, "ToClubId")
		playerID := db.StringField(row, "PlayerId")
		if clubID != from && clubID != to {
			return ErrForbidden
		}
		if row["ReturnedAt"] != nil {
			out = loanPayload(row)
			return nil // idempotent: already returned
		}
		tag, err := tx.Exec(ctx, `UPDATE "AssociationLoans" SET "ReturnedAt" = $2, "updatedAt" = $2
			WHERE "_id" = $1 AND "ReturnedAt" IS NULL`, loanID, now)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			// Lost a race: re-read and return the already-returned row.
			again, ok, err := scanOne(ctx, tx, loanColumns+` WHERE "_id" = $1`, loanID)
			if err != nil {
				return err
			}
			if !ok {
				return ErrLoanNotFound
			}
			out = loanPayload(again)
			return nil
		}
		if _, err := tx.Exec(ctx, `UPDATE "Players" SET "ClubId" = $2, "updatedAt" = now()
			WHERE "_id" = $1 AND "ClubId" = $3`, playerID, from, to); err != nil {
			return err
		}
		if err := writeLedger(ctx, tx, "loan_return", from, to, playerID, 0, "Loan returned"); err != nil {
			return err
		}
		row["ReturnedAt"] = db.ISO8601msUTC(now)
		out = loanPayload(row)
		return nil
	})
	return out, err
}

// OpenLoans lists an association's outstanding loans.
func (r *Repository) OpenLoans(ctx context.Context, assocID string) ([]any, error) {
	rows, err := scanAll(ctx, r.q, loanColumns+` WHERE "AssociationId" = $1 AND "ReturnedAt" IS NULL ORDER BY "createdAt"`, assocID)
	if err != nil {
		return nil, err
	}
	out := make([]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, loanPayload(row))
	}
	return out, nil
}

const loanColumns = `SELECT "_id", "AssociationId", "PlayerId", "FromClubId", "ToClubId", "DueAt", "ReturnedAt" FROM "AssociationLoans"`

func loanPayload(row map[string]any) map[string]any {
	return map[string]any{
		"id":            db.StringField(row, "_id"),
		"associationId": db.StringField(row, "AssociationId"),
		"playerId":      db.StringField(row, "PlayerId"),
		"fromClubId":    db.StringField(row, "FromClubId"),
		"toClubId":      db.StringField(row, "ToClubId"),
		"dueAt":         nullableString(row["DueAt"]),
		"returnedAt":    nullableString(row["ReturnedAt"]),
	}
}
