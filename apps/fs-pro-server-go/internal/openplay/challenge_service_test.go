package openplay

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

// seedRunningStage creates a running league-stage edition with the given clubs
// as active entries in one group. Test helper (rolled back by the caller).
func seedRunningStage(t *testing.T, ctx context.Context, tx db.Querier, clubs []string) string {
	t.Helper()
	cal, err := calendarAt(ctx, tx)
	if err != nil {
		t.Fatalf("calendar: %v", err)
	}
	today := intVal(cal["CurrentDay"])
	compRow, ok, err := dbScanOne(ctx, tx, `SELECT "_id" FROM "Competitions" LIMIT 1`)
	if err != nil {
		t.Fatalf("competition: %v", err)
	}
	if !ok {
		t.Skip("no competition")
	}
	def := map[string]any{
		"Name": "Challenge Cup", "Prestige": 2,
		"Entry":  map[string]any{"mode": "open", "minClubs": 2, "maxClubs": nil},
		"Stages": []any{map[string]any{"type": "league", "days": 60}},
	}
	defBytes, _ := json.Marshal(def)
	now := time.Now()
	season, err := db.InsertRow(ctx, tx, "Seasons", map[string]any{
		"SeasonCode": "TST-E1", "Title": "Test #1", "StartDate": now, "EndDate": now,
		"CompetitionId": db.StringField(compRow, "_id"), "CompetitionCode": "TST",
		"Status": "running", "CurrentStage": 0, "StageStartedDay": today,
		"StartDay": today, "Definition": string(defBytes), "updatedAt": now,
	})
	if err != nil {
		t.Fatalf("season: %v", err)
	}
	seasonID := db.StringField(season, "_id")
	for _, club := range clubs {
		if _, err := tx.Exec(ctx, `INSERT INTO "Entries" ("SeasonId","ClubId","Status","Group","updatedAt") VALUES ($1,$2,'active','A',now())`, seasonID, club); err != nil {
			t.Fatalf("entry: %v", err)
		}
	}
	return seasonID
}

// TestDayKind is the pure week-template scheduler helper.
func TestDayKind(t *testing.T) {
	cal := map[string]any{"YearStartDay": float64(0)}
	want := []string{"L", "C", "L", "L", "C", "L", "L", "L", "C"}
	for day, w := range want {
		if got := dayKind(cal, day); got != w {
			t.Errorf("dayKind(day %d) = %q, want %q", day, got, w)
		}
	}
	// Days before the year start fall on the same cycle.
	if got := dayKind(cal, -1); got != "L" {
		t.Errorf("dayKind(-1) = %q, want L", got)
	}
	// A custom template wins.
	if got := dayKind(map[string]any{"YearStartDay": float64(0), "WeekTemplate": []any{"C", "C"}}, 0); got != "C" {
		t.Errorf("custom template = %q", got)
	}
}

// TestApplyMatchToRow is the pure result-to-row maths.
func TestApplyMatchToRow(t *testing.T) {
	rules := LeagueRules{PointsForWin: 3, PointsForDraw: 1}
	var zero RankingRow
	win := applyMatchToRow(zero, 2, 1, rules, false)
	if win.Played != 1 || win.Wins != 1 || win.Points != 3 || win.GF != 2 || win.GA != 1 || win.GD != 1 || win.CleanSheets != 0 || win.UnbeatenRun != 1 || win.BestUnbeatenRun != 1 {
		t.Errorf("win row = %+v", win)
	}
	draw := applyMatchToRow(zero, 0, 0, rules, false)
	if draw.Draws != 1 || draw.Points != 1 || draw.CleanSheets != 1 || draw.UnbeatenRun != 1 {
		t.Errorf("draw row = %+v", draw)
	}
	loss := applyMatchToRow(zero, 0, 3, rules, true)
	if loss.Losses != 1 || loss.Points != 0 || loss.GA != 3 || loss.GD != -3 || loss.Forfeits != 1 || loss.UnbeatenRun != 0 {
		t.Errorf("loss row = %+v", loss)
	}
	// A run resets on a loss and the best is remembered.
	streak := applyMatchToRow(win, 1, 0, rules, false)
	streak = applyMatchToRow(streak, 0, 1, rules, false)
	if streak.UnbeatenRun != 0 || streak.BestUnbeatenRun != 2 {
		t.Errorf("streak reset = %+v", streak)
	}
}

// TestEloAfter checks the Elo expectations (k=24).
func TestEloAfter(t *testing.T) {
	h, a := eloAfter(1500, 1500, 1, defaultEloK)
	if math.Abs(h-1512) > 1e-9 || math.Abs(a-1488) > 1e-9 {
		t.Errorf("win: %v/%v", h, a)
	}
	h, a = eloAfter(1500, 1500, 0.5, defaultEloK)
	if math.Abs(h-1500) > 1e-9 || math.Abs(a-1500) > 1e-9 {
		t.Errorf("draw: %v/%v", h, a)
	}
	h, a = eloAfter(1500, 1500, 0, defaultEloK)
	if math.Abs(h-1488) > 1e-9 || math.Abs(a-1512) > 1e-9 {
		t.Errorf("loss: %v/%v", h, a)
	}
}

// TestResolveFullRules checks the default -> world -> stage precedence.
func TestResolveFullRules(t *testing.T) {
	base := resolveFullRules(nil, nil)
	if base.Metric != "ppg" || base.PointsForWin != 3 || base.MaxGames == nil || *base.MaxGames != 40 || base.MinDeclinesBeforeForfeit != 3 {
		t.Errorf("defaults = %+v", base)
	}
	world := resolveFullRules(nil, map[string]any{"pointsForWin": float64(2)})
	if world.PointsForWin != 2 {
		t.Errorf("world override = %d", world.PointsForWin)
	}
	stage := resolveFullRules(map[string]any{"rules": map[string]any{"metric": "points", "maxGames": nil}}, map[string]any{"pointsForWin": float64(2)})
	if stage.Metric != "points" || stage.MaxGames != nil {
		t.Errorf("stage override = %+v", stage)
	}
}

// TestChallengeProposeRespondRolledBack drives propose -> accept and
// propose -> decline (with a forfeit) against a seeded stage, all rolled back.
func TestChallengeProposeRespondRolledBack(t *testing.T) {
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
		cal, err := calendarAt(ctx, tx)
		if err != nil {
			return err
		}
		today := intVal(cal["CurrentDay"])
		clubs, err := dbScanAll(ctx, tx, `SELECT "_id" FROM "Clubs" LIMIT 3`)
		if err != nil {
			return err
		}
		if len(clubs) < 3 {
			t.Skip("need three clubs")
		}
		a, b, c := db.StringField(clubs[0], "_id"), db.StringField(clubs[1], "_id"), db.StringField(clubs[2], "_id")

		stageDef := map[string]any{
			"Name": "Challenge Cup", "Prestige": 2,
			"Entry":  map[string]any{"mode": "open", "minClubs": 2, "maxClubs": nil},
			"Stages": []any{map[string]any{"type": "league", "days": 60}},
		}
		defBytes, _ := json.Marshal(stageDef)
		compRow, ok, err := dbScanOne(ctx, tx, `SELECT "_id" FROM "Competitions" LIMIT 1`)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no competition")
		}
		compID := db.StringField(compRow, "_id")
		now := time.Now()
		season, err := db.InsertRow(ctx, tx, "Seasons", map[string]any{
			"SeasonCode": "TST-E1", "Title": "Test #1", "StartDate": now, "EndDate": now,
			"CompetitionId": compID, "CompetitionCode": "TST", "Status": "running", "CurrentStage": 0,
			"StageStartedDay": today, "StartDay": today, "Definition": string(defBytes), "updatedAt": now,
		})
		if err != nil {
			return err
		}
		seasonID := db.StringField(season, "_id")
		for _, club := range []string{a, b, c} {
			if _, err := tx.Exec(ctx, `INSERT INTO "Entries" ("SeasonId","ClubId","Status","Group","updatedAt") VALUES ($1,$2,'active','A',now())`, seasonID, club); err != nil {
				return err
			}
		}

		// propose A -> B (B plays at home), then B accepts.
		fixture, err := repo.Propose(ctx, seasonID, a, b)
		if err != nil {
			t.Fatalf("propose: %v", err)
		}
		if db.StringField(fixture, "ChallengeStatus") != "proposed" {
			t.Errorf("proposed status = %q", db.StringField(fixture, "ChallengeStatus"))
		}
		if db.StringField(fixture, "HomeTeamId") != b || db.StringField(fixture, "AwayTeamId") != a {
			t.Errorf("challenged club must be home")
		}
		accepted, err := repo.Accept(ctx, db.StringField(fixture, "_id"), b)
		if err != nil {
			t.Fatalf("accept: %v", err)
		}
		if db.StringField(accepted, "ChallengeStatus") != "accepted" {
			t.Errorf("accept status = %q", db.StringField(accepted, "ChallengeStatus"))
		}
		day := intVal(accepted["ScheduledDay"])
		if day == 0 || dayKind(cal, day) != "C" {
			t.Errorf("accepted day %d is not a cup day", day)
		}

		// propose A -> C, then C declines (no prior declines -> not a forfeit).
		fx2, err := repo.Propose(ctx, seasonID, a, c)
		if err != nil {
			t.Fatalf("propose 2: %v", err)
		}
		forfeited, err := repo.Decline(ctx, db.StringField(fx2, "_id"), c)
		if err != nil {
			t.Fatalf("decline: %v", err)
		}
		if forfeited {
			t.Error("first decline must not be a forfeit")
		}

		// Seed three prior declines for C, then the next decline forfeits.
		for i := 0; i < 3; i++ {
			if _, err := tx.Exec(ctx, `INSERT INTO "Fixtures" ("Title","SeasonId","StageIndex","HomeTeamId","AwayTeamId","ChallengeStatus","Played","updatedAt")
				VALUES ('seed',$1,0,$2,$3,'declined',false,now())`, seasonID, c, a); err != nil {
				return err
			}
		}
		fx3, err := repo.Propose(ctx, seasonID, a, c)
		if err != nil {
			t.Fatalf("propose 3: %v", err)
		}
		fx3ID := db.StringField(fx3, "_id")
		forfeited, err = repo.Decline(ctx, fx3ID, c)
		if err != nil {
			t.Fatalf("decline 2: %v", err)
		}
		if !forfeited {
			t.Fatal("fourth decline must forfeit")
		}
		final, err := loadFixture(ctx, tx, fx3ID)
		if err != nil {
			return err
		}
		if db.StringField(final, "ChallengeStatus") != "forfeited" || !boolVal(final["Played"]) {
			t.Errorf("forfeit fixture = %q played=%v", db.StringField(final, "ChallengeStatus"), boolVal(final["Played"]))
		}
		if n, err := countAt(ctx, tx, `SELECT count(*)::int AS n FROM "RankingResults" WHERE "FixtureId"=$1`, fx3ID); err != nil || n != 1 {
			t.Errorf("RankingResults rows = %d (err %v)", n, err)
		}
		// Away (challenger A) wins 3-0; home (C) loses.
		awayRow, err := oneAt(ctx, tx, `SELECT * FROM "Rankings" WHERE "SeasonId"=$1 AND "ClubId"=$2`, seasonID, a)
		if err != nil {
			return err
		}
		if awayRow == nil || intVal(awayRow["Wins"]) != 1 || intVal(awayRow["GF"]) != 3 {
			t.Errorf("away ranking after forfeit = %v", awayRow)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back challenges: %v", err)
	}
}

// TestDeclineForfeitAtomicRolledBack is the D27 regression: a failure inside
// applyResult must roll back the forfeit status with it (no half-forfeit), and
// a retry must then apply the result exactly once.
func TestDeclineForfeitAtomicRolledBack(t *testing.T) {
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
		clubs, err := dbScanAll(ctx, tx, `SELECT "_id" FROM "Clubs" LIMIT 2`)
		if err != nil {
			return err
		}
		if len(clubs) < 2 {
			t.Skip("need two clubs")
		}
		a, c := db.StringField(clubs[0], "_id"), db.StringField(clubs[1], "_id")
		seasonID := seedRunningStage(t, ctx, tx, []string{a, c})
		// Three prior declines for the home club make the next one forfeit.
		for i := 0; i < 3; i++ {
			if _, err := tx.Exec(ctx, `INSERT INTO "Fixtures" ("Title","SeasonId","StageIndex","HomeTeamId","AwayTeamId","ChallengeStatus","Played","updatedAt")
				VALUES ('seed',$1,0,$2,$3,'declined',false,now())`, seasonID, c, a); err != nil {
				return err
			}
		}
		fx, err := repo.Propose(ctx, seasonID, a, c)
		if err != nil {
			t.Fatalf("propose: %v", err)
		}
		fxID := db.StringField(fx, "_id")

		// Force applyResult to fail: the whole decline must roll back.
		old := applyResultGuard
		applyResultGuard = func() error { return errors.New("forced applyResult failure") }
		defer func() { applyResultGuard = old }()
		if _, err := repo.Decline(ctx, fxID, c); err == nil {
			t.Fatal("decline must fail when applyResult fails")
		}
		after, err := loadFixture(ctx, tx, fxID)
		if err != nil {
			return err
		}
		if db.StringField(after, "ChallengeStatus") != "proposed" || boolVal(after["Played"]) {
			t.Errorf("half-forfeit: status=%q played=%v", db.StringField(after, "ChallengeStatus"), boolVal(after["Played"]))
		}
		if n, err := countAt(ctx, tx, `SELECT count(*)::int AS n FROM "RankingResults" WHERE "FixtureId"=$1`, fxID); err != nil || n != 0 {
			t.Errorf("result written despite failure: %d (err %v)", n, err)
		}

		// Retry with the guard cleared: applies exactly once.
		applyResultGuard = nil
		forfeited, err := repo.Decline(ctx, fxID, c)
		if err != nil || !forfeited {
			t.Fatalf("retry decline = %v / %v", forfeited, err)
		}
		if n, err := countAt(ctx, tx, `SELECT count(*)::int AS n FROM "RankingResults" WHERE "FixtureId"=$1`, fxID); err != nil || n != 1 {
			t.Errorf("result rows after retry = %d (err %v)", n, err)
		}
		// The once-only guard still refuses a second attempt.
		if _, err := repo.Decline(ctx, fxID, c); err == nil {
			t.Error("second decline must be refused (wrong-status)")
		}
		if n, err := countAt(ctx, tx, `SELECT count(*)::int AS n FROM "RankingResults" WHERE "FixtureId"=$1`, fxID); err != nil || n != 1 {
			t.Errorf("result rows after refused retry = %d (err %v)", n, err)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back decline atomicity: %v", err)
	}
}
