package program

import (
	"context"
	"time"

	"fs-pro-server/internal/db"
)

// Repository is the pgx-backed OwnerProgram store.
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// Q exposes the querier for access checks.
func (r *Repository) Q() db.Querier { return r.q }

// Program returns the club's OwnerProgram row, creating one when missing.
func (r *Repository) Program(ctx context.Context, clubID string) (map[string]any, error) {
	row, ok, err := r.one(ctx, `SELECT * FROM "OwnerProgram" WHERE "ClubId" = $1 LIMIT 1`, clubID)
	if err != nil || ok {
		return row, err
	}
	var budget float64
	if club, ok2, _ := r.one(ctx, `SELECT "Budget" FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID); ok2 {
		budget = floatOf(club["Budget"])
	} else {
		return nil, errClubNotFound
	}
	if _, err := db.InsertRow(ctx, r.q, "OwnerProgram", map[string]any{
		"ClubId": clubID, "Step": "manager", "StepStars": map[string]any{},
		"ProgramXp": 0, "StartingBalance": budget, "updatedAt": time.Now(),
	}); err != nil {
		return nil, err
	}
	row, _, err = r.one(ctx, `SELECT * FROM "OwnerProgram" WHERE "ClubId" = $1 LIMIT 1`, clubID)
	return row, err
}

// Budget returns the club's current budget.
func (r *Repository) Budget(ctx context.Context, clubID string) float64 {
	row, ok, err := r.one(ctx, `SELECT "Budget" FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
	if err != nil || !ok {
		return 0
	}
	return floatOf(row["Budget"])
}

// ClubExists reports whether the club exists.
func (r *Repository) ClubExists(ctx context.Context, clubID string) bool {
	_, ok, err := r.one(ctx, `SELECT "_id" FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
	return err == nil && ok
}

// SetDismissedTips stores the dismissed-tips list and returns it.
func (r *Repository) SetDismissedTips(ctx context.Context, clubID string, tips []string) ([]string, error) {
	if _, err := db.UpdateRow(ctx, r.q, "OwnerProgram", "ClubId", clubID, map[string]any{"DismissedTips": tips}, true); err != nil {
		return nil, err
	}
	return tips, nil
}

// SetChapter stores the chapter when the program is done.
func (r *Repository) SetChapter(ctx context.Context, clubID, chapter string) error {
	_, err := db.UpdateRow(ctx, r.q, "OwnerProgram", "ClubId", clubID, map[string]any{"Chapter": chapter}, true)
	return err
}

// CurrentYear returns Calendars.CurrentYear.
func (r *Repository) CurrentYear(ctx context.Context) int {
	row, ok, err := r.one(ctx, `SELECT "CurrentYear" FROM "Calendars" LIMIT 1`)
	if err != nil || !ok {
		return 0
	}
	return intOf(row["CurrentYear"])
}

// HasBoardAdvance reports whether a board_advance ledger row exists this year.
func (r *Repository) HasBoardAdvance(ctx context.Context, clubID, year string) bool {
	_, ok, err := r.one(ctx, `SELECT "_id" FROM "TransferLedger" WHERE "Type" = 'board_advance' AND "BuyerClubId" = $1 AND "Year" = $2 LIMIT 1`, clubID, year)
	return err == nil && ok
}

// GrantBoardAdvance credits the club and writes the ledger row.
func (r *Repository) GrantBoardAdvance(ctx context.Context, clubID, year string, amount float64, note string) error {
	if _, err := r.q.Exec(ctx, `UPDATE "Clubs" SET "Budget" = coalesce("Budget",0) + $2, "updatedAt" = now() WHERE "_id" = $1`, clubID, amount); err != nil {
		return err
	}
	_, err := r.q.Exec(ctx, `INSERT INTO "TransferLedger" ("Type","BuyerClubId","Amount","Year","Note","updatedAt")
		VALUES ('board_advance',$1,$2,$3,$4,now())`, clubID, amount, year, note)
	return err
}

func (r *Repository) one(ctx context.Context, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}
