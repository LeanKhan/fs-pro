package preseason

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/play"
)

var preseasonSeq int64

// ensurePreseasonSchema creates migration-0052's table inside the caller's
// rolled-back transaction when it has not been applied, so the test is
// self-sufficient. The real (migrated) table uses the same name/columns.
func ensurePreseasonSchema(ctx context.Context, q db.Querier) error {
	_, err := q.Exec(ctx, `CREATE TABLE IF NOT EXISTS "PreseasonProgress" (
		"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
		"ClubId" uuid NOT NULL,
		"Stage" integer NOT NULL,
		"BestStars" integer NOT NULL DEFAULT 0,
		"Attempts" integer NOT NULL DEFAULT 0,
		"ClearedAt" timestamp(3),
		"ClaimedAt" timestamp(3),
		"createdAt" timestamp(3) NOT NULL DEFAULT now(),
		"updatedAt" timestamp(3) NOT NULL DEFAULT now(),
		CONSTRAINT "preseason_progress_club_stage_uniq" UNIQUE ("ClubId","Stage"))`)
	return err
}

// preseasonClub inserts a club with a full 11-player squad and zero economy.
func preseasonClub(ctx context.Context, q db.Querier, name string) (string, error) {
	code := fmt.Sprintf("PZ%04d", atomic.AddInt64(&preseasonSeq, 1))
	row, err := db.InsertRow(ctx, q, "Clubs", map[string]any{
		"Name": name, "ClubCode": code, "Budget": 0.0, "Fans": 0, "ScoutTokens": 0,
		"SponsorCredits": 0, "StandingPoints": 1000, "ClubhouseTier": 1, "updatedAt": time.Now(),
	})
	if err != nil {
		return "", err
	}
	clubID := db.StringField(row, "_id")
	positions := []string{"GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "ATT", "ATT"}
	for i, pos := range positions {
		if _, err := q.Exec(ctx, `INSERT INTO "Players" ("ClubId","FirstName","LastName","Position","Rating","isSigned","isRetired","updatedAt")
			VALUES ($1,'Rookie',$2,$3,55,true,false,now())`, clubID, fmt.Sprintf("P%d", i+1), pos); err != nil {
			return "", err
		}
	}
	return clubID, nil
}

// fakeSim returns a deterministic simulator: a 3-0 home (attacker) win.
func fakeSim() play.Simulator {
	return func(context.Context, map[string]any) (map[string]any, error) {
		return map[string]any{
			"Details": map[string]any{
				"HomeTeamScore": 3, "AwayTeamScore": 0,
				"HomeTeamDetails": map[string]any{"Possession": 70.0, "XG": 2.6},
				"AwayTeamDetails": map[string]any{"Possession": 30.0, "XG": 0.3},
			},
			"Events": []any{map[string]any{"type": "goal", "message": "GOAL!", "time": "10'", "side": "home"}},
		}, nil
	}
}

func preseasonPool(t *testing.T) (context.Context, func(func(db.Querier) error)) {
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
	return ctx, func(fn func(db.Querier) error) {
		if err := db.InRollback(ctx, pool, fn); err != nil {
			t.Fatalf("rolled-back tx: %v", err)
		}
	}
}

func one(ctx context.Context, q db.Querier, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

func balances(t *testing.T, ctx context.Context, q db.Querier, clubID string) (cash float64, fans, tokens, credits int) {
	t.Helper()
	row, ok, err := one(ctx, q, `SELECT "Budget","Fans","ScoutTokens","SponsorCredits" FROM "Clubs" WHERE "_id" = $1`, clubID)
	if err != nil || !ok {
		t.Fatalf("balances: ok=%v err=%v", ok, err)
	}
	return floatOf(row["Budget"]), intOf(row["Fans"]), intOf(row["ScoutTokens"]), intOf(row["SponsorCredits"])
}

func floatOf(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int64:
		return float64(n)
	case int:
		return float64(n)
	default:
		return 0
	}
}

func countRows(t *testing.T, ctx context.Context, q db.Querier, sql string, args ...any) int {
	t.Helper()
	row, _, err := one(ctx, q, sql, args...)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if row == nil {
		return 0
	}
	return intOf(row["n"])
}

func ledgerRows(t *testing.T, ctx context.Context, q db.Querier, clubID string) int {
	t.Helper()
	row, _, err := one(ctx, q, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "BuyerClubId" = $1 AND "Type" = 'preseason_reward'`, clubID)
	if err != nil {
		t.Fatalf("ledger rows: %v", err)
	}
	return intOf(row["n"])
}

// TestPreseasonPlayClaimAndIdempotencyRolledBack is the full P9 loop: play stage
// 1 against the server-owned AI, clear it 3★, unlock stage 2, claim the
// guaranteed reward with ledger rows, and prove a second claim cannot pay twice.
func TestPreseasonPlayClaimAndIdempotencyRolledBack(t *testing.T) {
	ctx, inRollback := preseasonPool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensurePreseasonSchema(ctx, tx); err != nil {
			return err
		}
		club, err := preseasonClub(ctx, tx, "Onboard FC")
		if err != nil {
			return err
		}
		now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
		repo := NewRepository(tx).WithSimulator(fakeSim()).WithClock(func() time.Time { return now })

		// Initial state: the whole ladder visible, only stage 1 open.
		state, ok, err := repo.Build(ctx, club)
		if err != nil || !ok {
			return fmt.Errorf("build: ok=%v err=%w", ok, err)
		}
		if got := len(state["stages"].([]any)); got != StageCount() {
			t.Errorf("stages = %d, want %d", got, StageCount())
		}
		if state["nextStage"] != 1 || state["cleared"] != 0 {
			t.Errorf("initial state nextStage=%v cleared=%v", state["nextStage"], state["cleared"])
		}

		// Stage 2 is locked until stage 1 is cleared.
		if _, err := repo.Play(ctx, club, 2, PlayOptions{}); !errors.Is(err, ErrStageLocked) {
			t.Errorf("play stage 2 = %v, want ErrStageLocked", err)
		}

		// Stage 1: a real P5 raid in practice mode, resolved by the fake sim.
		res, err := repo.Play(ctx, club, 1, PlayOptions{})
		if err != nil {
			return fmt.Errorf("play stage 1: %w", err)
		}
		if res["cleared"] != true || res["stars"] != 3 || res["claimable"] != true {
			t.Errorf("stage 1 result = %#v", res)
		}
		score := res["score"].(map[string]any)
		if score["you"] != 3 || score["them"] != 0 {
			t.Errorf("score = %#v, want 3-0", score)
		}
		if n := countRows(t, ctx, tx, `SELECT count(*)::int AS n FROM "RaidResults" WHERE "AttackerClubId" = $1`, club); n != 1 {
			t.Errorf("RaidResults rows = %d, want 1 (the match must be real)", n)
		}
		// The server-owned AI opponent was created deterministically.
		if n := countRows(t, ctx, tx, `SELECT count(*)::int AS n FROM "Clubs" WHERE "ClubCode" = $1`, Stages[0].Code); n != 1 {
			t.Errorf("AI opponent rows = %d, want 1", n)
		}

		// Unlocked stage 2 now; stage 1 best is 3.
		state, _, err = repo.Build(ctx, club)
		if err != nil {
			return err
		}
		if state["nextStage"] != 2 || state["cleared"] != 1 || state["totalStars"] != 3 {
			t.Errorf("post-play state nextStage=%v cleared=%v totalStars=%v", state["nextStage"], state["cleared"], state["totalStars"])
		}

		// Claim stage 1: guaranteed reward + one ledger row per non-zero field.
		claim, err := repo.Claim(ctx, club, 1)
		if err != nil {
			return fmt.Errorf("claim stage 1: %w", err)
		}
		reward := Stages[0].Reward
		granted := claim["granted"].(map[string]any)
		if floatOf(granted["cash"]) != reward.Cash || intOf(granted["fans"]) != reward.Fans {
			t.Errorf("granted = %#v, want %+v", granted, reward)
		}
		cash, fans, tokens, credits := balances(t, ctx, tx, club)
		if cash != reward.Cash || fans != reward.Fans || tokens != reward.ScoutTokens || credits != reward.SponsorCredits {
			t.Errorf("balances after claim = %.0f/%d/%d/%d", cash, fans, tokens, credits)
		}
		wantRows := nonZeroFields(reward)
		if got := ledgerRows(t, ctx, tx, club); got != wantRows {
			t.Errorf("preseason_reward ledger rows = %d, want %d (one per currency)", got, wantRows)
		}

		// Idempotent: a second claim is refused and changes nothing.
		if _, err := repo.Claim(ctx, club, 1); !errors.Is(err, ErrAlreadyClaimed) {
			t.Errorf("second claim = %v, want ErrAlreadyClaimed", err)
		}
		cash2, fans2, _, _ := balances(t, ctx, tx, club)
		if cash2 != cash || fans2 != fans {
			t.Errorf("double claim paid again: %.0f/%d -> %.0f/%d", cash, fans, cash2, fans2)
		}
		if got := ledgerRows(t, ctx, tx, club); got != wantRows {
			t.Errorf("double claim wrote ledger rows: %d, want %d", got, wantRows)
		}
		return nil
	})
}

// TestPreseasonLedgerPerStageRolledBack proves the exit criterion directly:
// every claimed stage grants currency only alongside its ledger rows, for two
// consecutive stages.
func TestPreseasonLedgerPerStageRolledBack(t *testing.T) {
	ctx, inRollback := preseasonPool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensurePreseasonSchema(ctx, tx); err != nil {
			return err
		}
		club, err := preseasonClub(ctx, tx, "Ledger FC")
		if err != nil {
			return err
		}
		repo := NewRepository(tx).WithSimulator(fakeSim())

		totalLedger, totalCash, totalFans := 0, 0.0, 0
		for _, stage := range Stages[:2] {
			if _, err := repo.Play(ctx, club, stage.Index, PlayOptions{}); err != nil {
				return fmt.Errorf("play stage %d: %w", stage.Index, err)
			}
			if _, err := repo.Claim(ctx, club, stage.Index); err != nil {
				return fmt.Errorf("claim stage %d: %w", stage.Index, err)
			}
			// Per-currency: the ledger sum equals the reward, so no currency was
			// granted without a row.
			for col, want := range map[string]float64{
				"cash": stage.Reward.Cash, "fans": float64(stage.Reward.Fans),
			} {
				if want == 0 {
					continue
				}
				sum := ledgerSum(t, ctx, tx, club, stage.Index, col)
				if sum != want {
					t.Errorf("stage %d %s ledger sum = %.0f, want %.0f", stage.Index, col, sum, want)
				}
			}
			totalLedger += nonZeroFields(stage.Reward)
			totalCash += stage.Reward.Cash
			totalFans += stage.Reward.Fans
		}
		if got := ledgerRows(t, ctx, tx, club); got != totalLedger {
			t.Errorf("total ledger rows = %d, want %d", got, totalLedger)
		}
		cash, fans, _, _ := balances(t, ctx, tx, club)
		if cash != totalCash || fans != totalFans {
			t.Errorf("balances = %.0f/%d, want %.0f/%d", cash, fans, totalCash, totalFans)
		}
		return nil
	})
}

// TestPreseasonGuardsRolledBack proves the squad gate, the ladder gate and the
// clear-before-claim rule.
func TestPreseasonGuardsRolledBack(t *testing.T) {
	ctx, inRollback := preseasonPool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensurePreseasonSchema(ctx, tx); err != nil {
			return err
		}
		// A club with no squad cannot play.
		row, err := db.InsertRow(ctx, tx, "Clubs", map[string]any{
			"Name": "Squadless FC", "ClubCode": fmt.Sprintf("PS%d", atomic.AddInt64(&preseasonSeq, 1)),
			"ClubhouseTier": 1, "updatedAt": time.Now(),
		})
		if err != nil {
			return err
		}
		squadless := db.StringField(row, "_id")
		repo := NewRepository(tx).WithSimulator(fakeSim())
		if _, err := repo.Play(ctx, squadless, 1, PlayOptions{}); !errors.Is(err, ErrNoSquad) {
			t.Errorf("squadless play = %v, want ErrNoSquad", err)
		}

		club, err := preseasonClub(ctx, tx, "Guarded FC")
		if err != nil {
			return err
		}
		if _, err := repo.Play(ctx, club, 3, PlayOptions{}); !errors.Is(err, ErrStageLocked) {
			t.Errorf("skip-ahead play = %v, want ErrStageLocked", err)
		}
		if _, err := repo.Claim(ctx, club, 1); !errors.Is(err, ErrStageNotCleared) {
			t.Errorf("claim-before-clear = %v, want ErrStageNotCleared", err)
		}
		if _, err := repo.Play(ctx, club, StageCount()+1, PlayOptions{}); !errors.Is(err, ErrUnknownStage) {
			t.Errorf("unknown stage = %v, want ErrUnknownStage", err)
		}
		return nil
	})
}

// TestPreseasonOnboardingRailFromDBRolledBack proves the rail evaluator reads
// real persisted state and that a club which plays the opener and does the
// first-session actions completes the rail.
func TestPreseasonOnboardingRailFromDBRolledBack(t *testing.T) {
	ctx, inRollback := preseasonPool(t)
	inRollback(func(tx db.Querier) error {
		if err := ensurePreseasonSchema(ctx, tx); err != nil {
			return err
		}
		club, err := preseasonClub(ctx, tx, "Tutorial FC")
		if err != nil {
			return err
		}

		// Empty rail: nothing done yet.
		state, _, err := repoBuild(t, ctx, tx, club)
		if err != nil {
			return err
		}
		if state["onboardingComplete"] != false || state["cleared"] != 0 {
			return fmt.Errorf("fresh rail = %#v", state)
		}

		// First-session actions the rail teaches.
		if _, err := tx.Exec(ctx, `INSERT INTO "ClubAssets" ("ClubId","AssetType","Level","updatedAt")
			VALUES ($1,'turnstiles',1,now())`, club); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO "TransferLedger" ("Type","BuyerClubId","Amount","Note","updatedAt")
			VALUES ('collector_income',$1,100,'Turnstiles',now())`, club); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO "ClubAssets" ("ClubId","AssetType","Level","UpgradingTo","StartAt","CompleteAt","updatedAt")
			VALUES ($1,'stands',0,1,now(),now() + interval '1 hour',now())`, club); err != nil {
			return err
		}
		if err := saveHomeGrid(ctx, tx, club); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO "ClubGroundskeepers" ("ClubId","Count","updatedAt")
			VALUES ($1,2,now()) ON CONFLICT ("ClubId") DO UPDATE SET "Count" = 2`, club); err != nil {
			return err
		}
		// Clear the opener (also satisfies win_raid).
		repo := NewRepository(tx).WithSimulator(fakeSim())
		if _, err := repo.Play(ctx, club, 1, PlayOptions{}); err != nil {
			return err
		}

		state, _, err = repoBuild(t, ctx, tx, club)
		if err != nil {
			return err
		}
		if state["onboardingComplete"] != true {
			t.Errorf("rail not complete after first-session actions: %#v", state["onboarding"])
		}
		return nil
	})
}

// repoBuild is a helper so the test can reuse the read model.
func repoBuild(t *testing.T, ctx context.Context, q db.Querier, clubID string) (map[string]any, bool, error) {
	t.Helper()
	return NewRepository(q).Build(ctx, clubID)
}

// saveHomeGrid writes a legal Home layout directly, exercising the grid storage
// the rail's "set a grid" step reads.
func saveHomeGrid(ctx context.Context, q db.Querier, clubID string) error {
	slots := []string{
		`{"col":0,"row":3,"position":"GK"}`,
		`{"col":1,"row":1,"position":"DEF"}`,
		`{"col":1,"row":3,"position":"DEF"}`,
		`{"col":1,"row":5,"position":"DEF"}`,
		`{"col":2,"row":2,"position":"DEF"}`,
		`{"col":3,"row":0,"position":"MID"}`,
		`{"col":3,"row":2,"position":"MID"}`,
		`{"col":3,"row":4,"position":"MID"}`,
		`{"col":3,"row":6,"position":"MID"}`,
		`{"col":5,"row":2,"position":"ATT"}`,
		`{"col":5,"row":4,"position":"ATT"}`,
	}
	grid := `{"slots":[` + joinComma(slots) + `]}`
	_, err := q.Exec(ctx, `UPDATE "Clubs" SET "Layouts" = jsonb_build_object('home', $2::jsonb) WHERE "_id" = $1`, clubID, grid)
	return err
}

func joinComma(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += ","
		}
		out += p
	}
	return out
}

// nonZeroFields counts the currencies a reward pays (one ledger row each).
func nonZeroFields(r Reward) int {
	n := 0
	if r.Cash != 0 {
		n++
	}
	if r.Fans != 0 {
		n++
	}
	if r.ScoutTokens != 0 {
		n++
	}
	if r.SponsorCredits != 0 {
		n++
	}
	return n
}

// ledgerSum sums a stage's ledger rows for one currency label, matching the
// "(cash)"/"(fans)"/... note suffix written by grantReward.
func ledgerSum(t *testing.T, ctx context.Context, q db.Querier, clubID string, stage int, label string) float64 {
	t.Helper()
	row, _, err := one(ctx, q, `SELECT coalesce(sum("Amount"),0) AS s FROM "TransferLedger"
		WHERE "BuyerClubId" = $1 AND "Type" = 'preseason_reward' AND "Note" LIKE $2`,
		clubID, fmt.Sprintf("Pre-Season stage %d:%%(%s)", stage, label))
	if err != nil {
		t.Fatalf("ledger sum: %v", err)
	}
	switch s := row["s"].(type) {
	case float64:
		return s
	case int64:
		return float64(s)
	case int:
		return float64(s)
	default:
		return 0
	}
}
