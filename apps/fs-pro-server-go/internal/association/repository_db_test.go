package association

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"fs-pro-server/internal/campus"
	"fs-pro-server/internal/db"
)

var assocClubSeq int64

func testPool(t *testing.T) *db.Pool {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := db.New(ctx, url, 15*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func newTestClub(t *testing.T, ctx context.Context, q db.Querier, overrides map[string]any) string {
	t.Helper()
	code := fmt.Sprintf("AT%d", atomic.AddInt64(&assocClubSeq, 1))
	data := map[string]any{"Name": "Assoc Test " + code, "ClubCode": code, "updatedAt": time.Now()}
	for k, v := range overrides {
		data[k] = v
	}
	row, err := db.InsertRow(ctx, q, "Clubs", data)
	if err != nil {
		t.Fatalf("insert test club: %v", err)
	}
	return db.StringField(row, "_id")
}

func newTestPlayer(t *testing.T, ctx context.Context, q db.Querier, clubID string) string {
	t.Helper()
	row, err := db.InsertRow(ctx, q, "Players", map[string]any{
		"FirstName": "Test", "LastName": "Player", "ClubId": clubID, "updatedAt": time.Now(),
	})
	if err != nil {
		t.Fatalf("insert test player: %v", err)
	}
	return db.StringField(row, "_id")
}

func ledgerCount(t *testing.T, ctx context.Context, q db.Querier, clubID, typ string) int {
	t.Helper()
	row, _, err := scanOne(ctx, q, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "BuyerClubId" = $1 AND "Type" = $2`, clubID, typ)
	if err != nil {
		t.Fatalf("ledger count: %v", err)
	}
	return intOf(row["n"])
}

func clubBalance(t *testing.T, ctx context.Context, q db.Querier, clubID, column string) float64 {
	t.Helper()
	row, _, err := scanOne(ctx, q, fmt.Sprintf(`SELECT "%s" AS v FROM "Clubs" WHERE "_id" = $1`, column), clubID)
	if err != nil {
		t.Fatalf("club balance: %v", err)
	}
	return floatOf(row["v"])
}

func playerClub(t *testing.T, ctx context.Context, q db.Querier, playerID string) string {
	t.Helper()
	row, _, err := scanOne(ctx, q, `SELECT "ClubId" FROM "Players" WHERE "_id" = $1`, playerID)
	if err != nil {
		t.Fatalf("player club: %v", err)
	}
	return db.StringField(row, "ClubId")
}

// TestAssociationLifecycleRolledBack proves create/join/leave, the ≤50 cap, the
// "one association per club" rule, and leader promotion on leave.
func TestAssociationLifecycleRolledBack(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	now := time.Date(2026, time.October, 10, 12, 0, 0, 0, time.UTC)

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)
		leader := newTestClub(t, ctx, tx, nil)
		created, err := repo.Create(ctx, leader, "Alpha FC", "ALP", "the first", now)
		if err != nil {
			return fmt.Errorf("create: %w", err)
		}
		assocID, _ := created["id"].(string)
		if assocID == "" {
			return errors.New("create returned no id")
		}
		if intOf(created["memberCount"]) != 1 {
			return fmt.Errorf("memberCount = %v, want 1", created["memberCount"])
		}

		// A second club cannot reuse the name or be in two associations.
		other := newTestClub(t, ctx, tx, nil)
		if _, err := repo.Create(ctx, other, "Alpha FC", "OTR", "", now); !errors.Is(err, ErrNameTaken) {
			return fmt.Errorf("duplicate name err = %v, want ErrNameTaken", err)
		}
		if _, err := repo.Join(ctx, assocID, other, now); err != nil {
			return fmt.Errorf("join: %w", err)
		}
		if _, err := repo.Join(ctx, assocID, other, now); !errors.Is(err, ErrAlreadyMember) {
			return fmt.Errorf("re-join err = %v, want ErrAlreadyMember", err)
		}
		third := newTestClub(t, ctx, tx, nil)
		beta, err := repo.Create(ctx, third, "Beta FC", "BET", "", now)
		if err != nil {
			return fmt.Errorf("create beta: %w", err)
		}
		betaID, _ := beta["id"].(string)
		// A club already in one association cannot join another.
		if _, err := repo.Join(ctx, betaID, other, now); !errors.Is(err, ErrAlreadyMember) {
			return fmt.Errorf("cross-association join err = %v, want ErrAlreadyMember", err)
		}

		// Fill to the cap then refuse one more.
		for i := 0; i < MaxMembers-2; i++ {
			c := newTestClub(t, ctx, tx, nil)
			if _, err := repo.Join(ctx, assocID, c, now); err != nil {
				return fmt.Errorf("fill join %d: %w", i, err)
			}
		}
		extra := newTestClub(t, ctx, tx, nil)
		if _, err := repo.Join(ctx, assocID, extra, now); !errors.Is(err, ErrMemberCap) {
			return fmt.Errorf("over-cap join err = %v, want ErrMemberCap", err)
		}

		// Leaving: a non-member is refused, a member succeeds.
		if err := repo.Leave(ctx, assocID, extra, now); !errors.Is(err, ErrNotAMember) {
			return fmt.Errorf("leave non-member err = %v, want ErrNotAMember", err)
		}
		if err := repo.Leave(ctx, assocID, other, now); err != nil {
			return fmt.Errorf("leave: %w", err)
		}
		// The leader can leave; leadership passes to a remaining member.
		if err := repo.Leave(ctx, assocID, leader, now); err != nil {
			return fmt.Errorf("leader leave: %w", err)
		}
		payload, ok, err := repo.Get(ctx, assocID, now)
		if err != nil || !ok {
			return fmt.Errorf("get: ok=%v err=%v", ok, err)
		}
		if intOf(payload["memberCount"]) != MaxMembers-2 {
			return fmt.Errorf("memberCount after leaves = %v, want %d", payload["memberCount"], MaxMembers-2)
		}
		members, _ := payload["members"].([]any)
		foundLeader := false
		for _, m := range members {
			if mm, ok := m.(map[string]any); ok && mm["role"] == string(RoleLeader) {
				foundLeader = true
			}
		}
		if !foundLeader {
			return errors.New("promotion left the association without a leader")
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back association lifecycle: %v", err)
	}
}

// TestLoanLedgerGuardRolledBack proves loans move the player transactionally,
// write a ledger row, enforce the per-level slot cap, and that a return is
// idempotent (no second ClubId move, no second ledger row).
func TestLoanLedgerGuardRolledBack(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	now := time.Date(2026, time.October, 10, 12, 0, 0, 0, time.UTC)

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)
		lender := newTestClub(t, ctx, tx, nil)
		borrower := newTestClub(t, ctx, tx, nil)
		created, err := repo.Create(ctx, lender, "Loan FC", "LON", "", now)
		if err != nil {
			return err
		}
		assocID, _ := created["id"].(string)
		if _, err := repo.Join(ctx, assocID, borrower, now); err != nil {
			return err
		}
		player := newTestPlayer(t, ctx, tx, lender)
		loan, err := repo.MoveLoan(ctx, assocID, lender, player, borrower, 24, now)
		if err != nil {
			return fmt.Errorf("move loan: %w", err)
		}
		if playerClub(t, ctx, tx, player) != borrower {
			return errors.New("player did not move to the borrowing club")
		}
		if ledgerCount(t, ctx, tx, borrower, "loan") != 1 {
			return errors.New("loan must write one ledger row")
		}
		// A second active loan for the same player is refused (the guarded
		// insert), regardless of which side asks.
		if _, err := repo.MoveLoan(ctx, assocID, borrower, player, lender, 24, now); !errors.Is(err, ErrLoanExists) {
			return fmt.Errorf("double loan err = %v, want ErrLoanExists", err)
		}

		// Slot cap: level-1 associations hold LoanSlots(1) open loans.
		for i := 0; i < LoanSlots(1)-1; i++ {
			p := newTestPlayer(t, ctx, tx, lender)
			if _, err := repo.MoveLoan(ctx, assocID, lender, p, borrower, 24, now); err != nil {
				return fmt.Errorf("slot-filling loan %d: %w", i, err)
			}
		}
		extra := newTestPlayer(t, ctx, tx, lender)
		if _, err := repo.MoveLoan(ctx, assocID, lender, extra, borrower, 24, now); !errors.Is(err, ErrLoanSlotsFull) {
			return fmt.Errorf("over-cap loan err = %v, want ErrLoanSlotsFull", err)
		}

		// Return: player goes home, one ledger row, and the second call is a
		// no-op (idempotent) rather than a double move.
		loanID, _ := loan["id"].(string)
		if _, err := repo.ReturnLoan(ctx, assocID, lender, loanID, now); err != nil {
			return fmt.Errorf("return loan: %w", err)
		}
		if playerClub(t, ctx, tx, player) != lender {
			return errors.New("player did not return home")
		}
		if ledgerCount(t, ctx, tx, lender, "loan_return") != 1 {
			return errors.New("return must write one ledger row")
		}
		again, err := repo.ReturnLoan(ctx, assocID, lender, loanID, now)
		if err != nil {
			return fmt.Errorf("idempotent return: %w", err)
		}
		if again["returnedAt"] == nil {
			return errors.New("idempotent return lost the returnedAt timestamp")
		}
		if ledgerCount(t, ctx, tx, lender, "loan_return") != 1 {
			return errors.New("idempotent return must not write a second ledger row")
		}
		if playerClub(t, ctx, tx, player) != lender {
			return errors.New("idempotent return moved the player again")
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back loans: %v", err)
	}
}

// TestDerbyLifecycleRolledBack proves prep -> battle -> score -> loot over the
// Derbies/DerbyMatches tables, the attempt cap, once-only resolution, and that
// a practice derby pays nothing.
func TestDerbyLifecycleRolledBack(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	now := time.Date(2026, time.October, 10, 12, 0, 0, 0, time.UTC)

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)
		homeClub := newTestClub(t, ctx, tx, nil)
		awayClub := newTestClub(t, ctx, tx, nil)
		home, err := repo.Create(ctx, homeClub, "Home Derby", "HME", "", now)
		if err != nil {
			return err
		}
		away, err := repo.Create(ctx, awayClub, "Away Derby", "AWY", "", now)
		if err != nil {
			return err
		}
		homeID, _ := home["id"].(string)
		awayID, _ := away["id"].(string)

		derby, err := repo.CreateDerby(ctx, homeID, awayID, now, now, now.Add(2*time.Hour), false, now)
		if err != nil {
			return fmt.Errorf("create derby: %w", err)
		}
		derbyID, _ := derby["id"].(string)
		// Attacks are refused during prep.
		if _, err := repo.RecordAttempt(ctx, derbyID, homeID, homeClub, awayClub, 3, 90, now); !errors.Is(err, ErrDerbyNotInBattle) {
			return fmt.Errorf("prep attempt err = %v, want ErrDerbyNotInBattle", err)
		}
		// The battle phase opens once the schedule reaches battleStarts.
		if _, err := repo.AdvanceDerby(ctx, derbyID, now); err != nil {
			return fmt.Errorf("advance: %w", err)
		}
		advanced, ok, err := repo.GetDerby(ctx, derbyID)
		if err != nil || !ok {
			return fmt.Errorf("get derby: ok=%v err=%v", ok, err)
		}
		if advanced["phase"] != string(PhaseBattle) {
			return fmt.Errorf("phase = %v, want battle", advanced["phase"])
		}

		// Home uses both attempts, then the third is refused.
		if _, err := repo.RecordAttempt(ctx, derbyID, homeID, homeClub, awayClub, 3, 90, now); err != nil {
			return fmt.Errorf("home attempt 1: %w", err)
		}
		if _, err := repo.RecordAttempt(ctx, derbyID, homeID, homeClub, awayClub, 2, 70, now); err != nil {
			return fmt.Errorf("home attempt 2: %w", err)
		}
		if _, err := repo.RecordAttempt(ctx, derbyID, homeID, homeClub, awayClub, 1, 20, now); !errors.Is(err, ErrAttemptsExhausted) {
			return fmt.Errorf("third attempt err = %v, want ErrAttemptsExhausted", err)
		}
		// Away uses both: 3 + 2 = 5 vs home 5 -> destruction tiebreak (home 80, away 80) is a draw.
		if _, err := repo.RecordAttempt(ctx, derbyID, awayID, awayClub, homeClub, 3, 80, now); err != nil {
			return fmt.Errorf("away attempt 1: %w", err)
		}
		final, err := repo.RecordAttempt(ctx, derbyID, awayID, awayClub, homeClub, 2, 80, now)
		if err != nil {
			return fmt.Errorf("away attempt 2: %w", err)
		}
		if final["phase"] != string(PhaseComplete) {
			return fmt.Errorf("derby phase = %v, want complete once both sides are exhausted", final["phase"])
		}
		if final["homeStars"] != final["awayStars"] {
			return fmt.Errorf("stars = %v-%v", final["homeStars"], final["awayStars"])
		}

		// A replay of the final attempt cannot double-count.
		if _, err := repo.RecordAttempt(ctx, derbyID, awayID, awayClub, homeClub, 2, 80, now); !errors.Is(err, ErrAttemptsExhausted) && !errors.Is(err, ErrDerbyComplete) {
			return fmt.Errorf("replay err = %v, want exhausted/complete", err)
		}

		// A window-expiry derby resolves without exhausting attempts.
		expired, err := repo.CreateDerby(ctx, homeID, awayID, now.Add(-3*time.Hour), now.Add(-2*time.Hour), now.Add(-time.Hour), false, now)
		if err != nil {
			return err
		}
		expiredID, _ := expired["id"].(string)
		if _, err := repo.AdvanceDerby(ctx, expiredID, now); err != nil {
			return err
		}
		done, ok, err := repo.GetDerby(ctx, expiredID)
		if err != nil || !ok || done["phase"] != string(PhaseComplete) {
			return fmt.Errorf("expired derby not completed: %+v err=%v", done["phase"], err)
		}

		// Idempotent resolution: a second sweep resolves nothing new.
		resolved, err := ResolveDueDerbies(ctx, tx, now)
		if err != nil {
			return err
		}
		if resolved != 0 {
			return fmt.Errorf("second sweep resolved %d, want 0", resolved)
		}

		// A practice derby pays nothing even when won.
		practice, err := repo.CreateDerby(ctx, homeID, awayID, now, now, now.Add(2*time.Hour), true, now)
		if err != nil {
			return err
		}
		practiceID, _ := practice["id"].(string)
		if _, err := repo.AdvanceDerby(ctx, practiceID, now); err != nil {
			return err
		}
		if _, err := repo.RecordAttempt(ctx, practiceID, homeID, homeClub, awayClub, 3, 100, now); err != nil {
			return err
		}
		if _, err := repo.RecordAttempt(ctx, practiceID, homeID, homeClub, awayClub, 3, 100, now); err != nil {
			return err
		}
		if _, err := repo.RecordAttempt(ctx, practiceID, awayID, awayClub, homeClub, 0, 0, now); err != nil {
			return err
		}
		if _, err := repo.RecordAttempt(ctx, practiceID, awayID, awayClub, homeClub, 0, 0, now); err != nil {
			return err
		}
		if balance := clubVault(t, ctx, tx, homeClub); balance != 0 {
			return fmt.Errorf("practice derby paid %v, want 0", balance)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back derby: %v", err)
	}
}

func clubVault(t *testing.T, ctx context.Context, q db.Querier, clubID string) float64 {
	t.Helper()
	row, ok, err := scanOne(ctx, q, `SELECT "Balance" FROM "BoardVault" WHERE "ClubId" = $1`, clubID)
	if err != nil {
		t.Fatalf("board vault: %v", err)
	}
	if !ok {
		return 0
	}
	return floatOf(row["Balance"])
}

// TestDirectiveOncePerTierRolledBack proves a directive tier is claimable once
// per member per tier and pays exactly one ledger row.
func TestDirectiveOncePerTierRolledBack(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	now := time.Date(2026, time.October, 10, 12, 0, 0, 0, time.UTC)
	week := WeeklyKey(now)

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)
		club := newTestClub(t, ctx, tx, map[string]any{"Budget": 0.0, "Fans": 0})
		assoc, err := repo.Create(ctx, club, "Directive FC", "DIR", "", now)
		if err != nil {
			return err
		}
		assocID, _ := assoc["id"].(string)
		if err := repo.EnsureWeeklyDirectives(ctx, assocID, week, now); err != nil {
			return fmt.Errorf("seed directives: %w", err)
		}
		list, ok, err := repo.ListDirectives(ctx, assocID, week, club, now)
		if err != nil || !ok {
			return fmt.Errorf("list: ok=%v err=%v", ok, err)
		}
		directives, _ := list["directives"].([]any)
		if len(directives) == 0 {
			return errors.New("no directives seeded")
		}
		// Find tier 1.
		tier1 := ""
		for _, d := range directives {
			dm, _ := d.(map[string]any)
			if intOf(dm["tier"]) == 1 {
				tier1, _ = dm["id"].(string)
			}
		}
		if tier1 == "" {
			return errors.New("tier 1 directive missing")
		}
		// Claiming before the goal is a conflict.
		if _, err := repo.ClaimDirectiveTier(ctx, assocID, tier1, club, 1, now); !errors.Is(err, ErrTierNotReached) {
			return fmt.Errorf("early claim err = %v, want ErrTierNotReached", err)
		}
		if err := repo.AddDirectiveProgress(ctx, assocID, club, 5, now); err != nil {
			return fmt.Errorf("progress: %w", err)
		}
		if _, err := repo.ClaimDirectiveTier(ctx, assocID, tier1, club, 1, now); err != nil {
			return fmt.Errorf("claim: %w", err)
		}
		if ledgerCount(t, ctx, tx, club, "directive") != 1 {
			return errors.New("claim must write one ledger row")
		}
		if clubBalance(t, ctx, tx, club, "Budget") <= 0 {
			return errors.New("claim must pay the Cash reward")
		}
		// A second claim of the same tier is refused.
		if _, err := repo.ClaimDirectiveTier(ctx, assocID, tier1, club, 1, now); !errors.Is(err, ErrTierAlreadyClaimed) {
			return fmt.Errorf("second claim err = %v, want ErrTierAlreadyClaimed", err)
		}
		if ledgerCount(t, ctx, tx, club, "directive") != 1 {
			return errors.New("a refused claim must not write a ledger row")
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back directives: %v", err)
	}
}

// TestDirectiveTierPerkGrantRolledBack proves a directive tier reward grants its
// Board Perk into Clubs.Perks exactly once (the ClaimedTier guard), so a
// replayed claim cannot double-grant.
func TestDirectiveTierPerkGrantRolledBack(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	now := time.Date(2026, time.October, 10, 12, 0, 0, 0, time.UTC)
	week := WeeklyKey(now)

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)
		club := newTestClub(t, ctx, tx, map[string]any{"Budget": 0.0, "Fans": 0})
		assoc, err := repo.Create(ctx, club, "Perk FC", "PKF", "", now)
		if err != nil {
			return err
		}
		assocID, _ := assoc["id"].(string)
		if err := repo.EnsureWeeklyDirectives(ctx, assocID, week, now); err != nil {
			return fmt.Errorf("seed directives: %w", err)
		}
		list, ok, err := repo.ListDirectives(ctx, assocID, week, club, now)
		if err != nil || !ok {
			return fmt.Errorf("list: ok=%v err=%v", ok, err)
		}
		tier2 := ""
		for _, d := range list["directives"].([]any) {
			dm, _ := d.(map[string]any)
			if intOf(dm["tier"]) == 2 {
				tier2, _ = dm["id"].(string)
			}
		}
		if tier2 == "" {
			return errors.New("tier 2 directive missing")
		}
		if err := repo.AddDirectiveProgress(ctx, assocID, club, 5, now); err != nil {
			return fmt.Errorf("progress: %w", err)
		}
		if _, err := repo.ClaimDirectiveTier(ctx, assocID, tier2, club, 2, now); err != nil {
			return fmt.Errorf("claim tier 2: %w", err)
		}
		if got := assocClubPerk(t, ctx, tx, club, "resource_cache"); got != 1 {
			return fmt.Errorf("resource_cache after claim = %d, want 1", got)
		}
		if _, err := repo.ClaimDirectiveTier(ctx, assocID, tier2, club, 2, now); !errors.Is(err, ErrTierAlreadyClaimed) {
			return fmt.Errorf("second claim err = %v, want ErrTierAlreadyClaimed", err)
		}
		if got := assocClubPerk(t, ctx, tx, club, "resource_cache"); got != 1 {
			return fmt.Errorf("a refused claim doubled resource_cache: %d", got)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back directive perk grant: %v", err)
	}
}

// assocClubPerk reads a perk's remaining count from a club's Clubs.Perks inventory.
func assocClubPerk(t *testing.T, ctx context.Context, q db.Querier, clubID, perk string) int {
	t.Helper()
	row, ok, err := scanOne(ctx, q, `SELECT "Perks" FROM "Clubs" WHERE "_id"=$1`, clubID)
	if err != nil || !ok {
		t.Fatalf("read Clubs.Perks: ok=%v err=%v", ok, err)
	}
	perks, _ := row["Perks"].(map[string]any)
	return campus.PerkCount(perks, perk)
}

// TestGroundsAndFestivalRolledBack proves the co-op build debits Cash, banks
// Capital Gold, levels the Grounds, writes a ledger row, and that the Festival
// window is reported across the Fri 07:00 -> Mon 07:00 UTC boundary.
func TestGroundsAndFestivalRolledBack(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	open := time.Date(2026, time.October, 9, 7, 0, 0, 0, time.UTC)    // Friday open
	closed := time.Date(2026, time.October, 9, 6, 59, 0, 0, time.UTC) // Friday before open

	run := func(tx db.Querier) error {
		repo := NewRepository(tx)
		club := newTestClub(t, ctx, tx, map[string]any{"Budget": 10000.0})
		assoc, err := repo.Create(ctx, club, "Grounds FC", "GRD", "", open)
		if err != nil {
			return err
		}
		assocID, _ := assoc["id"].(string)

		before, err := repo.GetGrounds(ctx, assocID, closed)
		if err != nil {
			return err
		}
		if before["festivalActive"] != false {
			return fmt.Errorf("festivalActive Friday 06:59 = %v, want false", before["festivalActive"])
		}
		during, err := repo.GetGrounds(ctx, assocID, open)
		if err != nil {
			return err
		}
		if during["festivalActive"] != true {
			return fmt.Errorf("festivalActive Friday 07:00 = %v, want true", during["festivalActive"])
		}
		if during["festivalClosesAt"] != db.ISO8601msUTC(time.Date(2026, time.October, 12, 7, 0, 0, 0, time.UTC)) {
			return fmt.Errorf("festivalClosesAt = %v", during["festivalClosesAt"])
		}

		if _, err := repo.ContributeGrounds(ctx, assocID, club, GroundsUpgradeCost(1), open); err != nil {
			return fmt.Errorf("contribute: %w", err)
		}
		if got := clubBalance(t, ctx, tx, club, "Budget"); got != 10000-float64(GroundsUpgradeCost(1)) {
			return fmt.Errorf("budget after contribution = %v", got)
		}
		after, err := repo.GetGrounds(ctx, assocID, open)
		if err != nil {
			return err
		}
		if intOf(after["level"]) != 2 {
			return fmt.Errorf("grounds level = %v, want 2", after["level"])
		}
		if ledgerCount(t, ctx, tx, club, "grounds") != 1 {
			return errors.New("contribution must write one ledger row")
		}
		// A club that cannot afford it is refused.
		poor := newTestClub(t, ctx, tx, map[string]any{"Budget": 0.0})
		if _, err := repo.Join(ctx, assocID, poor, open); err != nil {
			return err
		}
		if _, err := repo.ContributeGrounds(ctx, assocID, poor, 100, open); !errors.Is(err, ErrInsufficientFunds) {
			return fmt.Errorf("poor contribution err = %v, want ErrInsufficientFunds", err)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back grounds: %v", err)
	}
}
