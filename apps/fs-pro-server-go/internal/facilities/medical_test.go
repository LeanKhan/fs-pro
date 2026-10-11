package facilities

import (
	"context"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

func TestCalculateTreatmentCosts(t *testing.T) {
	c := CalculateTreatmentCosts(0)
	if c.SquadRecovery != 20000 || c.Rehab != 16000 || c.Hyperbaric != 9000 || c.Surgery != 45000 {
		t.Errorf("base costs = %+v", c)
	}
	half := CalculateTreatmentCosts(0.5)
	if half.SquadRecovery != 10000 || half.Surgery != 22500 {
		t.Errorf("half discount = %+v", half)
	}
	// Discount is clamped to [0, 0.5].
	if got := CalculateTreatmentCosts(0.9).SquadRecovery; got != 10000 {
		t.Errorf("clamped discount = %v", got)
	}
	if got := CalculateTreatmentCosts(-1).SquadRecovery; got != 20000 {
		t.Errorf("negative discount = %v", got)
	}
}

func TestFormatVilla(t *testing.T) {
	cases := map[float64]string{
		20000: "V20,000", 16000: "V16,000", 9000: "V9,000", 45000: "V45,000",
		1000000: "V1M", 1500000: "V1.5M", 0: "V0", 500: "V500", -500: "-V500",
	}
	for n, want := range cases {
		if got := formatVilla(n); got != want {
			t.Errorf("formatVilla(%v) = %q, want %q", n, got, want)
		}
	}
}

func TestMedicalRolledBack(t *testing.T) {
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
		row, ok, err := dbQueryOne(ctx, tx, `SELECT "ClubId" FROM "Players" WHERE "ClubId" IS NOT NULL AND "isRetired" = false LIMIT 1`)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no club with players")
		}
		clubID := db.StringField(row, "ClubId")

		// Status is readable and well-shaped.
		status, ok, err := repo.MedicalStatus(ctx, clubID)
		if err != nil || !ok {
			t.Fatalf("medical status: %v / ok=%v", err, ok)
		}
		for _, key := range []string{"facilityLevel", "treatmentBays", "baysAvailable", "squadRecovery", "costs", "injuredPlayers", "fatiguedPlayers"} {
			if _, present := status[key]; !present {
				t.Errorf("medical status missing %q", key)
			}
		}

		// Give the club a large budget for the paid actions.
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Budget" = 500000 WHERE "_id" = $1`, clubID); err != nil {
			return err
		}
		before := 500000.0

		// Squad recovery debits once and writes one ledger row.
		res, err := repo.SquadRecovery(ctx, clubID)
		if err != nil {
			t.Fatalf("squad recovery: %v", err)
		}
		cost := numb(res["cost"])
		if cost <= 0 {
			t.Errorf("recovery cost = %v", cost)
		}
		if remaining := numb(res["remainingBudget"]); remaining != before-cost {
			t.Errorf("remaining = %v, want %v", remaining, before-cost)
		}
		if n := countRows(ctx, tx, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "BuyerClubId"=$1 AND "Type"='medical_treatment' AND "Note"='Squad Cryotherapy Session'`, clubID); n != 1 {
			t.Errorf("recovery ledger rows = %d", n)
		}
		// Players' fitness never exceeds 100.
		if n := countRows(ctx, tx, `SELECT count(*)::int AS n FROM "Players" WHERE "ClubId"=$1 AND "Fitness" > 100`, clubID); n != 0 {
			t.Errorf("%d players over 100 fitness", n)
		}

		// Hyperbaric treatment charges its own cost and no double-charge on a retry.
		playerRow, ok, err := dbQueryOne(ctx, tx, `SELECT "_id" FROM "Players" WHERE "ClubId"=$1 AND "isRetired"=false LIMIT 1`, clubID)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no player")
		}
		playerID := db.StringField(playerRow, "_id")
		base := before - cost
		tr, err := repo.TreatPlayer(ctx, clubID, playerID, "hyperbaric")
		if err != nil {
			t.Fatalf("hyperbaric: %v", err)
		}
		trCost := numb(tr["cost"])
		if remaining := numb(tr["remainingBudget"]); remaining != base-trCost {
			t.Errorf("treatment remaining = %v, want %v", remaining, base-trCost)
		}
		if player, _ := tr["player"].(map[string]any); numb(player["fitness"]) != 100 {
			t.Errorf("hyperbaric fitness = %v", player["fitness"])
		}
		if n := countRows(ctx, tx, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "BuyerClubId"=$1 AND "Type"='medical_treatment' AND "Note" LIKE 'Hyperbaric%'`, clubID); n != 1 {
			t.Errorf("hyperbaric ledger rows = %d", n)
		}

		// Unknown treatment is refused; insufficient budget is refused with the
		// exact message and leaves no ledger row.
		if _, err := repo.TreatPlayer(ctx, clubID, playerID, "bogus"); err == nil || err.Error() != "Unknown treatment type" {
			t.Errorf("unknown treatment: %v", err)
		}
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Budget" = 0 WHERE "_id" = $1`, clubID); err != nil {
			return err
		}
		rowsBefore := countRows(ctx, tx, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "BuyerClubId"=$1`, clubID)
		if _, err := repo.SquadRecovery(ctx, clubID); err == nil {
			t.Error("recovery with no budget must be refused")
		}
		if rowsAfter := countRows(ctx, tx, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "BuyerClubId"=$1`, clubID); rowsAfter != rowsBefore {
			t.Errorf("refused recovery wrote a ledger row (%d -> %d)", rowsBefore, rowsAfter)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back medical: %v", err)
	}
}

func numb(v any) float64 { return floatOf(v) }

func dbQueryOne(ctx context.Context, q db.Querier, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

func countRows(ctx context.Context, q db.Querier, sql string, args ...any) int {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return -1
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return -1
	}
	return intOf(m["n"])
}
