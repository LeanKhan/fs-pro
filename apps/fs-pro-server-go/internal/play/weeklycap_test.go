package play

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
	"fs-pro-server/internal/league"
)

// P10 hardening: the weekly ranked-attack cap (04 §4.3, L9). A club that has
// joined this week's ladder pool (a StandingPools row) and spent its
// AttacksPerPool allowance cannot start another ranked raid (409) or search for
// one (400). Clubs under the cap, clubs not signed up, and practice friendlies
// are unaffected. All DB tests run inside db.InRollback.

// makePlayable gives a club the employed manager (PLAY gate) and a distinctive
// rating so it is the nearest matchmaking candidate in these tests.
func makePlayable(t *testing.T, ctx context.Context, q db.Querier, clubID string) {
	t.Helper()
	if _, err := db.InsertRow(ctx, q, "Managers", map[string]any{
		"Key": clubID, "FirstName": "Test", "LastName": "Manager", "Age": 40,
		"ClubId": clubID, "isEmployed": true, "updatedAt": time.Now(),
	}); err != nil {
		t.Fatalf("insert manager: %v", err)
	}
	if _, err := q.Exec(ctx, `UPDATE "Clubs" SET "Rating" = 9999 WHERE "_id" = $1`, clubID); err != nil {
		t.Fatalf("set rating: %v", err)
	}
}

// seedPool inserts a weekly ladder pool row for a club.
func seedPool(t *testing.T, ctx context.Context, q db.Querier, clubID, leagueCode, week string, attacks, stars int) {
	t.Helper()
	if _, err := q.Exec(ctx, `INSERT INTO "StandingPools" ("LeagueCode","WeekKey","ClubId","Pool","Attacks","Stars","updatedAt")
		VALUES ($1,$2,$3,0,$4,$5,now())`, leagueCode, week, clubID, attacks, stars); err != nil {
		t.Fatalf("seed pool: %v", err)
	}
}

// poolState reads a club's (attacks, stars) for a week, ok=false when no row.
func poolState(t *testing.T, ctx context.Context, q db.Querier, clubID, week string) (attacks, stars int, ok bool) {
	t.Helper()
	row, ok, err := testOne(ctx, q, `SELECT "Attacks","Stars" FROM "StandingPools" WHERE "ClubId"=$1 AND "WeekKey"=$2`, clubID, week)
	if err != nil {
		t.Fatalf("pool state: %v", err)
	}
	if !ok {
		return 0, 0, false
	}
	return intOf(row["Attacks"]), intOf(row["Stars"]), true
}

// TestWeeklyAttackCapRefusesRolledBack: a signed-up club at its weekly attack
// allowance is refused with a clear 409 reason, before any raid is queued.
func TestWeeklyAttackCapRefusesRolledBack(t *testing.T) {
	_, ctx, inRollback := raidPool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensureRaidSchema(ctx, tx); err != nil {
			return err
		}
		a, err := raidClub(ctx, tx, "Cap A")
		if err != nil {
			return err
		}
		b, err := raidClub(ctx, tx, "Cap B")
		if err != nil {
			return err
		}
		makePlayable(t, ctx, tx, a)
		makePlayable(t, ctx, tx, b)

		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
		week := league.WeekKey(now)
		// Silver I (index 5) allows 11 weekly attacks; the club has spent all.
		allowed := league.AttacksPerPool(league.LeagueByCode("silver_1"))
		if allowed != 11 {
			t.Fatalf("AttacksPerPool(silver_1) = %d, want 11", allowed)
		}
		seedPool(t, ctx, tx, a, "silver_1", week, allowed, 0)

		repo := NewRepository(tx).
			WithSimulator(fakeSim(3, 0, 65, 2.4, 0.6)).
			WithClock(func() time.Time { return now })

		_, err = repo.PlayMatch(ctx, a, PlayOptions{OpponentID: b})
		if err == nil {
			t.Fatal("a club over its weekly allowance must be refused")
		}
		gate, ok := err.(PlayGateError)
		if !ok {
			t.Fatalf("err = %T %v, want PlayGateError (409)", err, err)
		}
		if !strings.Contains(gate.Message, "weekly ranked attacks") || !strings.Contains(gate.Message, "11") {
			t.Errorf("reason = %q (want clear weekly-cap message naming 11)", gate.Message)
		}
		// The refusal is pre-flight: no raid, no spending, no ledger row.
		if n := countRows(t, ctx, tx, `SELECT count(*)::int AS n FROM "Raids" WHERE "AttackerClubId"=$1`, a); n != 0 {
			t.Errorf("raids created for a capped club = %d, want 0", n)
		}
		if atk, _, _ := poolState(t, ctx, tx, a, week); atk != allowed {
			t.Errorf("attacks = %d, want still %d (no spend on refusal)", atk, allowed)
		}
		if n := countRows(t, ctx, tx, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "BuyerClubId"=$1`, a); n != 0 {
			t.Errorf("ledger rows for a capped club = %d, want 0", n)
		}
		return nil
	})
}

// TestWeeklyAttackCapDecrementsRolledBack: a ranked raid under the cap consumes
// exactly one attack and banks its stars on the club's pool row.
func TestWeeklyAttackCapDecrementsRolledBack(t *testing.T) {
	_, ctx, inRollback := raidPool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensureRaidSchema(ctx, tx); err != nil {
			return err
		}
		a, err := raidClub(ctx, tx, "Spend A")
		if err != nil {
			return err
		}
		b, err := raidClub(ctx, tx, "Spend B")
		if err != nil {
			return err
		}
		makePlayable(t, ctx, tx, a)
		makePlayable(t, ctx, tx, b)

		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
		week := league.WeekKey(now)
		seedPool(t, ctx, tx, a, "silver_1", week, 0, 0)

		repo := NewRepository(tx).
			WithSimulator(fakeSim(3, 0, 65, 2.4, 0.6)).
			WithClock(func() time.Time { return now })

		res, err := repo.PlayMatch(ctx, a, PlayOptions{OpponentID: b})
		if err != nil {
			t.Fatalf("an under-cap ranked raid must be allowed: %v", err)
		}
		if db.StringField(res, "fixtureId") == "" {
			t.Error("no fixtureId on the played match")
		}
		atk, stars, ok := poolState(t, ctx, tx, a, week)
		if !ok {
			t.Fatal("the pool row disappeared")
		}
		// fakeSim scores 3-0 → 3 stars, so the attack is spent and 3 stars banked.
		if atk != 1 || stars != 3 {
			t.Errorf("pool after raid = attacks %d stars %d, want 1/3", atk, stars)
		}
		return nil
	})
}

// TestWeeklyAttackCapResetsWithNewWeekRolledBack: the cap is week-scoped. A
// club that is capped in week 1 is free to raid again once the new week's pool
// opens (the reset cadence, 04 §4.3).
func TestWeeklyAttackCapResetsWithNewWeekRolledBack(t *testing.T) {
	_, ctx, inRollback := raidPool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensureRaidSchema(ctx, tx); err != nil {
			return err
		}
		a, err := raidClub(ctx, tx, "Reset A")
		if err != nil {
			return err
		}
		b, err := raidClub(ctx, tx, "Reset B")
		if err != nil {
			return err
		}
		makePlayable(t, ctx, tx, a)
		makePlayable(t, ctx, tx, b)

		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
		next := now.AddDate(0, 0, 7)
		week1, week2 := league.WeekKey(now), league.WeekKey(next)
		if week1 == week2 {
			t.Fatalf("test weeks must differ (%s == %s)", week1, week2)
		}
		allowed := league.AttacksPerPool(league.LeagueByCode("silver_1"))
		seedPool(t, ctx, tx, a, "silver_1", week1, allowed, 0)

		week1Repo := NewRepository(tx).
			WithSimulator(fakeSim(3, 0, 65, 2.4, 0.6)).
			WithClock(func() time.Time { return now })
		if _, err := week1Repo.PlayMatch(ctx, a, PlayOptions{OpponentID: b}); err == nil {
			t.Fatal("week 1 must be capped")
		}

		// The new week opens a fresh pool with a full allowance.
		seedPool(t, ctx, tx, a, "silver_1", week2, 0, 0)
		week2Repo := NewRepository(tx).
			WithSimulator(fakeSim(3, 0, 65, 2.4, 0.6)).
			WithClock(func() time.Time { return next })
		if _, err := week2Repo.PlayMatch(ctx, a, PlayOptions{OpponentID: b}); err != nil {
			t.Fatalf("week 2 must be allowed: %v", err)
		}
		if atk, _, ok := poolState(t, ctx, tx, a, week2); !ok || atk != 1 {
			t.Errorf("week 2 attacks = %d (ok=%v), want 1", atk, ok)
		}
		return nil
	})
}

// TestPracticeRaidExemptFromWeeklyCap: a practice friendly is no-stakes, so it
// is allowed even at the cap and does not consume an attack (02 §D2).
func TestPracticeRaidExemptFromWeeklyCap(t *testing.T) {
	_, ctx, inRollback := raidPool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensureRaidSchema(ctx, tx); err != nil {
			return err
		}
		a, err := raidClub(ctx, tx, "Practice A")
		if err != nil {
			return err
		}
		b, err := raidClub(ctx, tx, "Practice B")
		if err != nil {
			return err
		}
		makePlayable(t, ctx, tx, a)
		makePlayable(t, ctx, tx, b)

		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
		week := league.WeekKey(now)
		allowed := league.AttacksPerPool(league.LeagueByCode("silver_1"))
		seedPool(t, ctx, tx, a, "silver_1", week, allowed, 0)

		repo := NewRepository(tx).
			WithSimulator(fakeSim(3, 0, 65, 2.4, 0.6)).
			WithClock(func() time.Time { return now })
		if _, err := repo.PlayMatch(ctx, a, PlayOptions{OpponentID: b, Practice: true}); err != nil {
			t.Fatalf("a practice friendly must be exempt from the weekly cap: %v", err)
		}
		if atk, _, _ := poolState(t, ctx, tx, a, week); atk != allowed {
			t.Errorf("practice consumed an attack: attacks = %d, want %d", atk, allowed)
		}
		return nil
	})
}

// TestFindOpponentsRefusedAtWeeklyCapRolledBack: the matchmaking search itself
// is refused (400, the route's declared status) once the allowance is spent.
func TestFindOpponentsRefusedAtWeeklyCapRolledBack(t *testing.T) {
	_, ctx, inRollback := raidPool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensureRaidSchema(ctx, tx); err != nil {
			return err
		}
		a, err := raidClub(ctx, tx, "Search A")
		if err != nil {
			return err
		}
		if _, err := raidClub(ctx, tx, "Search B"); err != nil {
			return err
		}
		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
		week := league.WeekKey(now)
		repo := NewRepository(tx).WithClock(func() time.Time { return now })
		h := &Handlers{repo: repo}
		call := func() httpapi.Response {
			r := httptest.NewRequest(http.MethodGet, "/api/play/"+a+"/opponents", nil)
			r.SetPathValue("clubId", a)
			return h.findOpponents(nil, nil, r)
		}

		// Under the cap: the normal 200 opponent list.
		seedPool(t, ctx, tx, a, "silver_1", week, 0, 0)
		if got := call(); got.Status != 200 {
			t.Fatalf("under-cap findOpponents = %d (%v), want 200", got.Status, got.Body)
		}
		// At the cap: a 400 with the clear reason.
		allowed := league.AttacksPerPool(league.LeagueByCode("silver_1"))
		if _, err := tx.Exec(ctx, `UPDATE "StandingPools" SET "Attacks"=$3 WHERE "ClubId"=$1 AND "WeekKey"=$2`, a, week, allowed); err != nil {
			return err
		}
		got := call()
		if got.Status != 400 {
			t.Fatalf("capped findOpponents = %d (%v), want 400", got.Status, got.Body)
		}
		if msg, _ := got.Body["message"].(string); !strings.Contains(msg, "weekly ranked attacks") {
			t.Errorf("message = %q, want the weekly-cap reason", msg)
		}
		return nil
	})
}
