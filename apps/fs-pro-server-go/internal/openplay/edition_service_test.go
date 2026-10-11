package openplay

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

// TestCheckDates is the pure create-date guard: opens <= closes <= start, and
// the start may not be in the past.
func TestCheckDates(t *testing.T) {
	r := NewRepository(nil)
	cases := []struct {
		name string
		d    EditionDates
		ok   bool
		msg  string
	}{
		{"in order", EditionDates{1, 5, 10}, true, ""},
		{"equal days", EditionDates{5, 5, 5}, true, ""},
		{"closes before opens", EditionDates{6, 5, 10}, false, "Dates must run registration opens <= registration closes <= start"},
		{"start before closes", EditionDates{1, 9, 8}, false, "Dates must run registration opens <= registration closes <= start"},
	}
	for _, tc := range cases {
		err := r.checkDates(tc.d, 0)
		if tc.ok {
			if err != nil {
				t.Errorf("%s: unexpected error %v", tc.name, err)
			}
			continue
		}
		if err == nil {
			t.Errorf("%s: expected an error", tc.name)
			continue
		}
		if err.Error() != tc.msg {
			t.Errorf("%s: message %q, want %q", tc.name, err.Error(), tc.msg)
		}
	}
	if err := r.checkDates(EditionDates{1, 2, 3}, 5); err == nil || err.Error() != "Start day is in the past" {
		t.Errorf("past start: %v", err)
	}
}

// TestLevelForXp checks the default curve (100*n^2) and custom thresholds.
func TestLevelForXp(t *testing.T) {
	// Default thresholds are not passed here: pass an explicit small curve.
	th := []any{float64(0), float64(100), float64(400), float64(900)}
	for _, tc := range []struct {
		xp   int
		want int
	}{{0, 0}, {99, 0}, {100, 1}, {399, 1}, {400, 2}, {899, 2}, {900, 3}, {5000, 7}} {
		if got := levelForXp(tc.xp, th); got != tc.want {
			t.Errorf("levelForXp(%d) = %d, want %d", tc.xp, got, tc.want)
		}
	}
	// Past the end of the thresholds the 100*n^2 curve applies.
	if got := levelForXp(2500, th); got != 5 {
		t.Errorf("curve fallback: %d", got)
	}
}

// TestEligibilityAndRegisterRolledBack exercises the eligibility predicate and
// the register/withdraw writes inside a transaction that is always rolled back.
func TestEligibilityAndRegisterRolledBack(t *testing.T) {
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
		compRow, ok, err := dbScanOne(ctx, tx, `SELECT "_id" FROM "Competitions" LIMIT 1`)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no competition")
		}
		compID := db.StringField(compRow, "_id")
		clubs, err := dbScanAll(ctx, tx, `SELECT "_id","Budget" FROM "Clubs" ORDER BY "Budget" DESC NULLS LAST LIMIT 2`)
		if err != nil {
			return err
		}
		if len(clubs) < 2 {
			t.Skip("need two clubs")
		}
		clubA := db.StringField(clubs[0], "_id")
		clubB := db.StringField(clubs[1], "_id")
		cal, err := calendarAt(ctx, tx)
		if err != nil {
			return err
		}
		today := intVal(cal["CurrentDay"])

		// Create a draft edition (admin path) with valid dates.
		edition, err := repo.CreateEdition(ctx, compID, EditionDates{today, today, today})
		if err != nil {
			t.Fatalf("createEdition: %v", err)
		}
		if db.StringField(edition, "Status") != "draft" {
			t.Errorf("new edition status = %q, want draft", db.StringField(edition, "Status"))
		}
		editionID := db.StringField(edition, "_id")

		setDef := func(entry map[string]any) error {
			def := map[string]any{
				"Name": "Test Cup", "Prestige": 2,
				"Entry":  entry,
				"Stages": []any{map[string]any{"type": "league", "days": 30}},
			}
			b, _ := json.Marshal(def)
			_, err := tx.Exec(ctx, `UPDATE "Seasons" SET "Status"='registration', "Definition"=$2::jsonb WHERE "_id"=$1`, editionID, string(b))
			return err
		}

		// Open registration, no fee -> eligible, register -> registered.
		if err := setDef(map[string]any{"mode": "open", "minClubs": 2, "maxClubs": nil}); err != nil {
			return err
		}
		check, err := eligibilityAt(ctx, tx, editionID, clubA)
		if err != nil {
			return err
		}
		if !check.Eligible || len(check.Reasons) != 0 {
			t.Errorf("open registration eligible=%v reasons=%v", check.Eligible, check.Reasons)
		}
		entry, err := repo.Register(ctx, editionID, clubA)
		if err != nil {
			t.Fatalf("register: %v", err)
		}
		if db.StringField(entry, "Status") != "registered" {
			t.Errorf("entry status = %q", db.StringField(entry, "Status"))
		}
		// A second registration is refused: Already entered.
		if _, err := repo.Register(ctx, editionID, clubA); err == nil {
			t.Error("double registration must be refused")
		}
		// Withdraw (registration status refunds; no fee here).
		if err := repo.Withdraw(ctx, editionID, clubA); err != nil {
			t.Fatalf("withdraw: %v", err)
		}

		// Fee path: entryFee 100, budget 1000 -> debit + ledger, withdraw refunds.
		if err := setDef(map[string]any{"mode": "open", "minClubs": 2, "maxClubs": nil, "entryFee": 100}); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Budget" = 1000 WHERE "_id" = $1`, clubB); err != nil {
			return err
		}
		if _, err := repo.Register(ctx, editionID, clubB); err != nil {
			t.Fatalf("fee register: %v", err)
		}
		budget, err := scalarFloat(ctx, tx, `SELECT "Budget" AS v FROM "Clubs" WHERE "_id" = $1`, clubB)
		if err != nil {
			return err
		}
		if budget != 900 {
			t.Errorf("budget after fee = %v, want 900", budget)
		}
		led, err := countAt(ctx, tx, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "Type"='entry_fee' AND "SellerClubId"=$1`, clubB)
		if err != nil {
			return err
		}
		if led != 1 {
			t.Errorf("entry_fee ledger rows = %d", led)
		}
		if err := repo.Withdraw(ctx, editionID, clubB); err != nil {
			t.Fatalf("fee withdraw: %v", err)
		}
		budget, err = scalarFloat(ctx, tx, `SELECT "Budget" AS v FROM "Clubs" WHERE "_id" = $1`, clubB)
		if err != nil {
			return err
		}
		if budget != 1000 {
			t.Errorf("budget after refund = %v, want 1000", budget)
		}

		// maxClubs reached: seed a holding entry for clubA, then check clubB.
		if err := setDef(map[string]any{"mode": "open", "minClubs": 2, "maxClubs": 2}); err != nil {
			return err
		}
		for _, id := range []string{clubA, clubB} {
			_, err := tx.Exec(ctx, `INSERT INTO "Entries" ("SeasonId","ClubId","Status","updatedAt") VALUES ($1,$2,'registered',now())
				ON CONFLICT ("SeasonId","ClubId") DO UPDATE SET "Status"='registered'`, editionID, id)
			if err != nil {
				return err
			}
		}
		check, err = eligibilityAt(ctx, tx, editionID, clubA)
		if err != nil {
			return err
		}
		if !containsString(check.Reasons, "Already entered") {
			// clubA is holding its own entry -> "Already entered"; places also full.
			t.Errorf("full edition: expected Already entered, got %v", check.Reasons)
		}

		// Invite-only is refused without an invite.
		if err := setDef(map[string]any{"mode": "invite", "minClubs": 2, "maxClubs": nil}); err != nil {
			return err
		}
		_, _ = tx.Exec(ctx, `DELETE FROM "Entries" WHERE "SeasonId"=$1`, editionID)
		check, err = eligibilityAt(ctx, tx, editionID, clubA)
		if err != nil {
			return err
		}
		if !containsString(check.Reasons, "Invitation only") {
			t.Errorf("invite mode: %v", check.Reasons)
		}

		// A draft (unpublished) edition is closed for registration, but its
		// definition is absent -> "Not open for entry yet".
		if _, err := tx.Exec(ctx, `UPDATE "Seasons" SET "Status"='draft', "Definition"=NULL WHERE "_id"=$1`, editionID); err != nil {
			return err
		}
		check, err = eligibilityAt(ctx, tx, editionID, clubA)
		if err != nil {
			return err
		}
		if check.Eligible || !containsString(check.Reasons, "Not open for entry yet") {
			t.Errorf("unpublished: %v", check.Reasons)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back editions: %v", err)
	}
}

func dbScanAll(ctx context.Context, q db.Querier, sql string, args ...any) ([]map[string]any, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

func dbScanOne(ctx context.Context, q db.Querier, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

func scalarFloat(ctx context.Context, q db.Querier, sql string, args ...any) (float64, error) {
	m, ok, err := dbScanOne(ctx, q, sql, args...)
	if err != nil || !ok {
		return 0, err
	}
	return numVal(m["v"]), nil
}
