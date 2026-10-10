package preseason

import (
	"context"
	"errors"
	"fmt"
	"time"

	"fs-pro-server/internal/campus"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/grid"
	"fs-pro-server/internal/play"
)

// This file wires the pure Pre-Season Tour core (preseason.go) to Postgres and
// the P5 raid path (docs/coc-mapping/02 §J, 04 §8, 05 §4/§6, 06 P9).
//
// The match is real: it is queued and resolved through play.Repository (the same
// QueueRaid/ResolveRaid path a PvP raid uses), so the sim is deterministic and
// no second match engine exists. The AI opponents are server-owned Clubs rows
// with a deterministic identity (ClubCode PRE-nn) and a deterministic squad, and
// every reward is granted once through a TransferLedger row.

// Sentinel errors the handlers map to HTTP statuses.
var (
	ErrClubNotFound    = errors.New("club not found")
	ErrUnknownStage    = errors.New("unknown Pre-Season stage")
	ErrStageLocked     = errors.New("that stage is not unlocked yet")
	ErrStageNotCleared = errors.New("clear the stage with 3 stars before claiming its reward")
	ErrAlreadyClaimed  = errors.New("this stage reward has already been claimed")
	ErrNoSquad         = errors.New("you need a legal matchday squad (11 fit players) before you play")
	// ErrBadLayout is returned when an attacker-supplied layout fails validation
	// at the club's Clubhouse tier.
	ErrBadLayout = errors.New("that layout is not valid at your Clubhouse tier")
)

// PlayOptions are the optional per-match inputs for a Pre-Season stage.
type PlayOptions struct {
	Watch   bool
	Orders  []any
	Layout  *grid.Grid
	Effects map[string][]any
}

// Repository is the pgx-backed Pre-Season Tour store. Every mutation runs in a
// transaction; the match itself runs through play.Repository bound to the same
// transaction (savepoints), so the raid and the progress write commit together.
type Repository struct {
	q   db.Querier
	sim play.Simulator
	now func() time.Time
}

// NewRepository wraps a Querier. The simulator is left at the play default
// (clients.SimulateMatch); tests inject a deterministic fake.
func NewRepository(q db.Querier) *Repository {
	return &Repository{q: q, now: time.Now}
}

// Q exposes the querier for access checks.
func (r *Repository) Q() db.Querier { return r.q }

// WithSimulator replaces the match simulator (tests, or a future sharded runner).
func (r *Repository) WithSimulator(s play.Simulator) *Repository {
	if s != nil {
		r.sim = s
	}
	return r
}

// WithClock replaces the repository clock (tests pin it).
func (r *Repository) WithClock(now func() time.Time) *Repository {
	if now != nil {
		r.now = now
	}
	return r
}

func (r *Repository) clock() time.Time {
	if r.now != nil {
		return r.now().UTC()
	}
	return time.Now().UTC()
}

// playRepo builds a play repository bound to `q` carrying the injected simulator
// and clock, so the raid runs on the correct connection (the caller's tx in a
// mutation, the pool on a read).
func (r *Repository) playRepo(q db.Querier) *play.Repository {
	pr := play.NewRepository(q)
	if r.sim != nil {
		pr = pr.WithSimulator(r.sim)
	}
	return pr.WithClock(r.now)
}

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

// clubState reads the club fields the rail needs (and locks the row on writes).
func clubState(ctx context.Context, q db.Querier, clubID string, forUpdate bool) (map[string]any, bool, error) {
	sql := `SELECT "_id","Name","ClubCode","ClubhouseTier","Budget","Fans","ScoutTokens","SponsorCredits","Layouts"
		FROM "Clubs" WHERE "_id" = $1`
	if forUpdate {
		sql += ` FOR UPDATE`
	}
	rows, err := q.Query(ctx, sql, clubID)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

// progressRows loads the club's per-stage progress keyed by stage index.
func progressRows(ctx context.Context, q db.Querier, clubID string) (map[int]map[string]any, error) {
	rows, err := q.Query(ctx, `SELECT "Stage","BestStars","Attempts","ClearedAt","ClaimedAt"
		FROM "PreseasonProgress" WHERE "ClubId" = $1`, clubID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := make(map[int]map[string]any, len(list))
	for _, m := range list {
		out[intOf(m["Stage"])] = m
	}
	return out, nil
}

// loadFacts assembles the onboarding snapshot from the club's persisted state.
func loadFacts(ctx context.Context, q db.Querier, club map[string]any, clubID string) (Facts, error) {
	f := Facts{}

	rows, err := q.Query(ctx, `SELECT "AssetType","Level","UpgradingTo" FROM "ClubAssets" WHERE "ClubId" = $1`, clubID)
	if err != nil {
		return f, err
	}
	assets, err := db.ScanAll(rows)
	if err != nil {
		return f, err
	}
	for _, a := range assets {
		if a["UpgradingTo"] != nil {
			f.Upgraded = true
		}
		switch db.StringField(a, "AssetType") {
		case "turnstiles":
			f.TurnstilesLevel = intOf(a["Level"])
		case "club_shop":
			f.ClubShopLevel = intOf(a["Level"])
		}
	}

	if layouts, ok := club["Layouts"].(map[string]any); ok && len(layouts) > 0 {
		f.HasGrid = true
	}

	keeper, _, err := dbScanOne(ctx, q, `SELECT "Count" FROM "ClubGroundskeepers" WHERE "ClubId" = $1`, clubID)
	if err != nil {
		return f, err
	}
	tier := intOf(club["ClubhouseTier"])
	if tier < 1 {
		tier = 1
	}
	f.Groundskeepers = effectiveGroundskeepers(keeper, tier)

	collect, _, err := dbScanOne(ctx, q, `SELECT EXISTS(
		SELECT 1 FROM "TransferLedger" WHERE "BuyerClubId" = $1 AND "Type" = 'collector_income') AS n`, clubID)
	if err != nil {
		return f, err
	}
	f.Collected = boolOf(collect["n"])

	win, _, err := dbScanOne(ctx, q, `SELECT EXISTS(
		SELECT 1 FROM "RaidResults" WHERE "AttackerClubId" = $1 AND "AttackerGoals" > "DefenderGoals") AS n`, clubID)
	if err != nil {
		return f, err
	}
	f.WonRaid = boolOf(win["n"])

	return f, nil
}

// effectiveGroundskeepers reuses the campus milestone function so the
// Groundskeeper-#2 onboarding target cannot drift from the economy.
func effectiveGroundskeepers(row map[string]any, tier int) int {
	count := 0
	if row != nil {
		count = intOf(row["Count"])
	}
	if grant := campus.GroundskeepersForTier(tier); count < grant {
		count = grant
	}
	if count > campus.MaxGroundskeepers {
		count = campus.MaxGroundskeepers
	}
	if count < 1 {
		count = 1
	}
	return count
}

// Build assembles the Pre-Season Tour read model.
func (r *Repository) Build(ctx context.Context, clubID string) (map[string]any, bool, error) {
	club, ok, err := clubState(ctx, r.q, clubID, false)
	if err != nil || !ok {
		return nil, ok, err
	}
	return r.build(ctx, r.q, club, clubID)
}

func (r *Repository) build(ctx context.Context, q db.Querier, club map[string]any, clubID string) (map[string]any, bool, error) {
	progress, err := progressRows(ctx, q, clubID)
	if err != nil {
		return nil, false, err
	}
	facts, err := loadFacts(ctx, q, club, clubID)
	if err != nil {
		return nil, false, err
	}
	stages, clearedCount, totalStars, next := stagePayloads(progress)
	steps := Evaluate(facts)
	onboarding := make([]any, 0, len(steps))
	for _, s := range steps {
		onboarding = append(onboarding, map[string]any{
			"id": string(s.ID), "title": s.Title, "hint": s.Hint, "done": s.Done,
		})
	}
	var nextStage any
	if next > 0 {
		nextStage = next
	}
	return map[string]any{
		"clubId":             clubID,
		"name":               db.StringField(club, "Name"),
		"stages":             stages,
		"cleared":            clearedCount,
		"total":              StageCount(),
		"totalStars":         totalStars,
		"onboarding":         onboarding,
		"onboardingComplete": OnboardingComplete(facts),
		"nextStage":          nextStage,
	}, true, nil
}

// stagePayloads renders the ladder with the club's progress. `next` is the
// highest stage the club may play (0 when the ladder is complete).
func stagePayloads(progress map[int]map[string]any) (stages []any, clearedCount, totalStars, next int) {
	clearedMap := map[int]bool{}
	for idx, row := range progress {
		if idx >= 1 && idx <= len(Stages) && intOf(row["BestStars"]) >= StarsRequiredPerStage {
			clearedMap[idx] = true
		}
	}
	clearedCount = HighestCleared(clearedMap)
	for i := 1; i <= StageCount(); i++ {
		row := progress[i]
		best, attempts := 0, 0
		cleared, claimed := false, false
		if row != nil {
			best = intOf(row["BestStars"])
			attempts = intOf(row["Attempts"])
			cleared = row["ClearedAt"] != nil
			claimed = row["ClaimedAt"] != nil
		}
		stage := Stages[i-1]
		if best > stage.RequiredStars() {
			best = stage.RequiredStars()
		}
		totalStars += best
		stages = append(stages, map[string]any{
			"index":         stage.Index,
			"code":          stage.Code,
			"name":          stage.Name,
			"opponent":      stage.Opponent,
			"rating":        stage.Rating,
			"requiredStars": stage.RequiredStars(),
			"reward":        rewardPayload(stage.Reward),
			"bestStars":     best,
			"attempts":      attempts,
			"cleared":       cleared,
			"claimed":       claimed,
			"unlocked":      i <= clearedCount+1,
		})
	}
	if clearedCount < len(Stages) {
		next = clearedCount + 1
	}
	return stages, clearedCount, totalStars, next
}

func rewardPayload(r Reward) map[string]any {
	return map[string]any{
		"cash":           r.Cash,
		"fans":           r.Fans,
		"scoutTokens":    r.ScoutTokens,
		"sponsorCredits": r.SponsorCredits,
	}
}

// ---------------------------------------------------------------------------
// Play
// ---------------------------------------------------------------------------

// Play resolves one Pre-Season stage against its server-owned AI opponent. The
// match runs through the P5 raid path in practice mode (no loot/Standing side
// effects; the guaranteed income is the stage reward on claim), with a
// deterministic seed derived from the club, the stage and the attempt count.
func (r *Repository) Play(ctx context.Context, clubID string, stageIndex int, opts PlayOptions) (map[string]any, error) {
	stage, ok := StageAt(stageIndex)
	if !ok {
		return nil, fmt.Errorf("%w: %d", ErrUnknownStage, stageIndex)
	}
	var out map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		club, found, err := clubState(ctx, tx, clubID, true)
		if err != nil {
			return err
		}
		if !found {
			return ErrClubNotFound
		}
		progress, err := progressRows(ctx, tx, clubID)
		if err != nil {
			return err
		}
		if err := assertUnlocked(progress, stage.Index); err != nil {
			return err
		}

		fit, _, err := dbScanOne(ctx, tx, `SELECT count(*)::int AS n FROM "Players"
			WHERE "ClubId" = $1 AND "isSigned" = true AND "isRetired" = false
			  AND ("Injury" IS NULL OR ("Injury"->>'daysRemaining')::int <= 0)`, clubID)
		if err != nil {
			return err
		}
		if intOf(fit["n"]) < grid.Starters {
			return ErrNoSquad
		}

		tier := intOf(club["ClubhouseTier"])
		if tier < 1 {
			tier = 1
		}
		if opts.Layout != nil {
			if reason := grid.Validate(*opts.Layout, tier); reason != "" {
				return fmt.Errorf("%w: %s", ErrBadLayout, reason)
			}
		}

		opponentID, err := r.ensureOpponent(ctx, tx, stage)
		if err != nil {
			return err
		}

		attempts, prevClaimed := 0, false
		if row := progress[stage.Index]; row != nil {
			attempts = intOf(row["Attempts"])
			prevClaimed = row["ClaimedAt"] != nil
		}
		seed := fmt.Sprintf("preseason:%s:%d:%d", clubID, stage.Index, attempts)

		pr := r.playRepo(tx)
		ref, err := pr.QueueRaid(ctx, play.RaidRequest{
			AttackerID: clubID, DefenderID: opponentID, Practice: true,
			Watch: opts.Watch, Seed: seed,
			Orders: opts.Orders, Layout: opts.Layout, Effects: opts.Effects,
		})
		if err != nil {
			return err
		}
		result, err := pr.ResolveRaid(ctx, ref.RaidID)
		if err != nil {
			return err
		}

		now := r.clock()
		if err := r.recordPlay(ctx, tx, clubID, stage, result.Stars, now); err != nil {
			return err
		}

		fresh, _, err := clubState(ctx, tx, clubID, false)
		if err != nil {
			return err
		}
		state, _, err := r.build(ctx, tx, fresh, clubID)
		if err != nil {
			return err
		}
		out = map[string]any{
			"stage":     stage.Index,
			"cleared":   stage.Cleared(result.Stars),
			"stars":     result.Stars,
			"bestStars": bestStars(progress[stage.Index], result.Stars),
			"score":     map[string]any{"you": result.AttackerGoals, "them": result.DefenderGoals},
			"reward":    rewardPayload(stage.Reward),
			"claimable": stage.Cleared(result.Stars) && !prevClaimed,
			"progress":  state,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// assertUnlocked enforces the ladder order: stage 1 is always open; stage n
// needs stage n-1 cleared.
func assertUnlocked(progress map[int]map[string]any, stageIndex int) error {
	cleared := map[int]bool{}
	for idx, row := range progress {
		if intOf(row["BestStars"]) >= StarsRequiredPerStage {
			cleared[idx] = true
		}
	}
	if stageIndex > UnlockedStage(cleared) {
		return fmt.Errorf("%w: clear stage %d first", ErrStageLocked, stageIndex-1)
	}
	return nil
}

// recordPlay upserts the stage's progress: attempts always advance, best stars
// are monotonic, and the clear timestamp is stamped once.
func (r *Repository) recordPlay(ctx context.Context, q db.Querier, clubID string, stage Stage, stars int, now time.Time) error {
	var clearedAt any
	if stage.Cleared(stars) {
		clearedAt = now
	}
	_, err := q.Exec(ctx, `INSERT INTO "PreseasonProgress" ("ClubId","Stage","BestStars","Attempts","ClearedAt","updatedAt")
		VALUES ($1,$2,$3,1,$4,now())
		ON CONFLICT ("ClubId","Stage") DO UPDATE
		SET "BestStars" = GREATEST("PreseasonProgress"."BestStars", EXCLUDED."BestStars"),
		    "Attempts" = "PreseasonProgress"."Attempts" + 1,
		    "ClearedAt" = COALESCE("PreseasonProgress"."ClearedAt", EXCLUDED."ClearedAt"),
		    "updatedAt" = now()`,
		clubID, stage.Index, stars, clearedAt)
	return err
}

func bestStars(row map[string]any, stars int) int {
	prev := 0
	if row != nil {
		prev = intOf(row["BestStars"])
	}
	if stars > prev {
		return stars
	}
	return prev
}

// ---------------------------------------------------------------------------
// Claim
// ---------------------------------------------------------------------------

// Claim grants a cleared stage's guaranteed reward exactly once. The claim is
// guarded by the (ClubId, Stage) row lock and the ClaimedAt flag, so a double
// claim (or a racing pair) can never pay twice.
func (r *Repository) Claim(ctx context.Context, clubID string, stageIndex int) (map[string]any, error) {
	stage, ok := StageAt(stageIndex)
	if !ok {
		return nil, fmt.Errorf("%w: %d", ErrUnknownStage, stageIndex)
	}
	var out map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if _, found, err := clubState(ctx, tx, clubID, true); err != nil {
			return err
		} else if !found {
			return ErrClubNotFound
		}
		row, found, err := dbScanOne(ctx, tx, `SELECT "BestStars","ClaimedAt" FROM "PreseasonProgress"
			WHERE "ClubId" = $1 AND "Stage" = $2 FOR UPDATE`, clubID, stage.Index)
		if err != nil {
			return err
		}
		if !found || intOf(row["BestStars"]) < stage.RequiredStars() {
			return ErrStageNotCleared
		}
		if row["ClaimedAt"] != nil {
			return ErrAlreadyClaimed
		}
		if _, err := tx.Exec(ctx, `UPDATE "PreseasonProgress" SET "ClaimedAt" = now(), "updatedAt" = now()
			WHERE "ClubId" = $1 AND "Stage" = $2`, clubID, stage.Index); err != nil {
			return err
		}
		if err := grantReward(ctx, tx, clubID, stage); err != nil {
			return err
		}

		club, _, err := clubState(ctx, tx, clubID, false)
		if err != nil {
			return err
		}
		state, _, err := r.build(ctx, tx, club, clubID)
		if err != nil {
			return err
		}
		out = map[string]any{
			"stage":    stage.Index,
			"granted":  rewardPayload(stage.Reward),
			"progress": state,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// grantReward credits the stage's currencies and writes one TransferLedger row
// per non-zero currency (04 §10: no currency without a ledger row).
func grantReward(ctx context.Context, q db.Querier, clubID string, stage Stage) error {
	reward := stage.Reward
	if _, err := q.Exec(ctx, `UPDATE "Clubs"
		SET "Budget" = coalesce("Budget", 0) + $2,
		    "Fans" = coalesce("Fans", 0) + $3,
		    "ScoutTokens" = coalesce("ScoutTokens", 0) + $4,
		    "SponsorCredits" = coalesce("SponsorCredits", 0) + $5,
		    "updatedAt" = now()
		WHERE "_id" = $1`,
		clubID, reward.Cash, int64(reward.Fans), int64(reward.ScoutTokens), int64(reward.SponsorCredits)); err != nil {
		return err
	}
	note := fmt.Sprintf("Pre-Season stage %d: %s", stage.Index, stage.Name)
	for _, part := range []struct {
		amount float64
		label  string
	}{
		{reward.Cash, "cash"},
		{float64(reward.Fans), "fans"},
		{float64(reward.ScoutTokens), "scout tokens"},
		{float64(reward.SponsorCredits), "sponsor credits"},
	} {
		if part.amount == 0 {
			continue
		}
		if _, err := q.Exec(ctx, `INSERT INTO "TransferLedger" ("Type","BuyerClubId","Amount","Note","updatedAt")
			VALUES ('preseason_reward', $1, $2, $3, now())`, clubID, part.amount, note+" ("+part.label+")"); err != nil {
			return err
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Server-owned AI opponents
// ---------------------------------------------------------------------------

// ensureOpponent returns the server-owned AI club for a stage, creating it (and
// a deterministic default squad) on first use. The opponent is identified by its
// deterministic ClubCode and is marked ReleasedAt so it never leaks into live
// matchmaking (05 §6: deterministic, server-owned opponents).
func (r *Repository) ensureOpponent(ctx context.Context, q db.Querier, stage Stage) (string, error) {
	if row, ok, err := dbScanOne(ctx, q, `SELECT "_id" FROM "Clubs" WHERE "ClubCode" = $1`, stage.Code); err != nil {
		return "", err
	} else if ok {
		return db.StringField(row, "_id"), nil
	}
	now := r.clock()
	if _, err := q.Exec(ctx, `INSERT INTO "Clubs"
		("Name","ClubCode","Rating","ClubhouseTier","UserId","Budget","Fans","ScoutTokens","ReleasedAt","updatedAt")
		VALUES ($1,$2,$3,1,NULL,0,0,0,$4,now())
		ON CONFLICT ("ClubCode") DO NOTHING`,
		stage.Opponent+" (Pre-Season)", stage.Code, stage.Rating, now); err != nil {
		return "", err
	}
	row, ok, err := dbScanOne(ctx, q, `SELECT "_id" FROM "Clubs" WHERE "ClubCode" = $1`, stage.Code)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", fmt.Errorf("could not create Pre-Season opponent %s", stage.Code)
	}
	opponentID := db.StringField(row, "_id")
	if err := ensureOpponentSquad(ctx, q, opponentID, stage); err != nil {
		return "", err
	}
	return opponentID, nil
}

// aiSquadPositions is the deterministic default shape of an AI opponent.
var aiSquadPositions = []string{"GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "ATT", "ATT"}

// ensureOpponentSquad gives a freshly created AI opponent a deterministic 11-man
// squad whose ratings sit around the stage's difficulty rating.
func ensureOpponentSquad(ctx context.Context, q db.Querier, clubID string, stage Stage) error {
	count, _, err := dbScanOne(ctx, q, `SELECT count(*)::int AS n FROM "Players" WHERE "ClubId" = $1`, clubID)
	if err != nil {
		return err
	}
	if intOf(count["n"]) >= len(aiSquadPositions) {
		return nil
	}
	for i, pos := range aiSquadPositions {
		rating := aiRating(stage.Rating, i)
		if _, err := q.Exec(ctx, `INSERT INTO "Players"
			("ClubId","FirstName","LastName","Position","Role","ShirtNumber","Rating","isSigned","isRetired","updatedAt")
			VALUES ($1,$2,$3,$4,$4,$5,$6,true,false,now())`,
			clubID, stage.Opponent, fmt.Sprintf("Academy %d", i+1), pos, fmt.Sprintf("%d", i+1), float64(rating)); err != nil {
			return err
		}
	}
	return nil
}

// aiRating spreads the stage rating across the XI deterministically (a -4..+4
// offset), clamped to a sane band.
func aiRating(base, i int) int {
	offset := (i*7)%9 - 4
	v := base + offset
	if v < 10 {
		v = 10
	}
	if v > 70 {
		v = 70
	}
	return v
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func dbScanOne(ctx context.Context, q db.Querier, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

func intOf(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int32:
		return int(n)
	case int64:
		return int(n)
	case float64:
		return int(n)
	case float32:
		return int(n)
	default:
		return 0
	}
}

func boolOf(v any) bool {
	switch b := v.(type) {
	case bool:
		return b
	case string:
		return b == "true" || b == "t"
	default:
		return false
	}
}
