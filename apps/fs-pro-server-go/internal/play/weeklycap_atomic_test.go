package play

import (
	"testing"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/league"
)

// P10 TOCTOU fix: the weekly ranked-attack cap (04 §4.3) is no longer a
// pre-flight read. The authoritative check runs inside the raid's own
// transaction, reading the attacker's StandingPools row FOR UPDATE, so the read
// is serialised against the counter increment league.RecordRankedRaid writes in
// the same transaction. Two concurrent resolutions for the same club can never
// both pass. All of this runs inside db.InRollback.

func TestWeeklyAttackCapAtomicRolledBack(t *testing.T) {
	_, ctx, inRollback := raidPool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensureRaidSchema(ctx, tx); err != nil {
			return err
		}
		a, err := raidClub(ctx, tx, "Atomic A")
		if err != nil {
			return err
		}
		b, err := raidClub(ctx, tx, "Atomic B")
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

		// (1) The cap is enforced in the raid transaction itself: a queued
		// ranked raid is refused even though PlayMatch's cheap pre-flight check
		// never ran. Nothing is applied.
		ref, err := repo.QueueRaid(ctx, RaidRequest{AttackerID: a, DefenderID: b})
		if err != nil {
			return err
		}
		_, err = repo.ResolveRaid(ctx, ref.RaidID)
		if err == nil {
			t.Fatal("a raid over the cap resolved")
		}
		if _, ok := err.(PlayGateError); !ok {
			t.Fatalf("resolve err = %T %v, want PlayGateError (409)", err, err)
		}
		if n := countRows(t, ctx, tx, `SELECT count(*)::int AS n FROM "RaidResults"`); n != 0 {
			t.Errorf("a refused raid wrote %d RaidResults rows", n)
		}
		if atk, _, _ := poolState(t, ctx, tx, a, week); atk != allowed {
			t.Errorf("a refused raid moved the counter: attacks = %d, want %d", atk, allowed)
		}
		if n := countRows(t, ctx, tx, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "BuyerClubId" = $1`, a); n != 0 {
			t.Errorf("a refused raid wrote %d ledger rows", n)
		}

		// Leave exactly one attack, then resolve one successfully.
		if _, err := tx.Exec(ctx, `UPDATE "StandingPools" SET "Attacks" = $3 WHERE "ClubId" = $1 AND "WeekKey" = $2`, a, week, allowed-1); err != nil {
			return err
		}
		ref2, err := repo.QueueRaid(ctx, RaidRequest{AttackerID: a, DefenderID: b})
		if err != nil {
			return err
		}
		if _, err := repo.ResolveRaid(ctx, ref2.RaidID); err != nil {
			return err
		}
		if atk, stars, ok := poolState(t, ctx, tx, a, week); !ok || atk != allowed || stars != 3 {
			t.Errorf("pool after the last raid = attacks %d stars %d (ok=%v), want %d/3", atk, stars, ok, allowed)
		}

		// (2) The check is a locking read: running it takes the StandingPools
		// relation's RowShareLock - the lock class SELECT ... FOR UPDATE takes -
		// so the transaction holds the row against a concurrent writer until it
		// ends. Together with the increment league.RecordRankedRaid performs in
		// this same transaction, that is what makes check+decrement atomic.
		//
		// A cross-connection contention probe is impossible inside a rolled-back
		// test: the pool row is uncommitted, so another connection cannot see it
		// (and therefore cannot lock it). The lock class is the observable,
		// deterministic signal here.
		_ = checkRankedAttackCap(ctx, tx, a, now) // at the cap: returns a gate error, lock already taken
		var lockMode, lockGranted string
		if err := tx.QueryRow(ctx, `SELECT l.mode, l.granted::text FROM pg_locks l
			JOIN pg_class c ON c.oid = l.relation
			WHERE c.relname = 'StandingPools' AND l.pid = pg_backend_pid() AND l.mode = 'RowShareLock'`).Scan(&lockMode, &lockGranted); err != nil {
			t.Fatalf("the cap check did not take a RowShareLock on StandingPools: %v", err)
		}
		if lockGranted != "true" {
			t.Errorf("StandingPools RowShareLock granted = %s, want true", lockGranted)
		}

		// (3) A second resolution now observes the incremented counter and is
		// refused - the atomicity the pre-flight read could not provide.
		ref3, err := repo.QueueRaid(ctx, RaidRequest{AttackerID: a, DefenderID: b})
		if err != nil {
			return err
		}
		if _, err := repo.ResolveRaid(ctx, ref3.RaidID); err == nil {
			t.Fatal("a second raid past the cap resolved")
		} else if _, ok := err.(PlayGateError); !ok {
			t.Fatalf("second resolve err = %T %v, want PlayGateError", err, err)
		}
		if atk, _, _ := poolState(t, ctx, tx, a, week); atk != allowed {
			t.Errorf("the counter moved past the cap: attacks = %d, want %d", atk, allowed)
		}
		return nil
	})
}
