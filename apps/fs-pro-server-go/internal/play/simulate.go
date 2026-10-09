package play

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"fs-pro-server/internal/clients"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/facilities"
)

func numOf(v any) float64 { return floatOf(v) }
func mapOf(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}
func clampF(x, lo, hi float64) float64 { return math.Min(hi, math.Max(lo, x)) }

// playMatch ported from services/play/play.service.ts: matchmake, run the sim,
// apply the gate + rewards + standing, set the cooldown and store the replay.

const matchTitleMark = "(Matchmade)"

var rewardXP = map[string]float64{"win": 30, "draw": 10, "loss": 5}

func cooldownBaseSeconds() float64 {
	if v := os.Getenv("MATCH_COOLDOWN_SECONDS"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
			return f / gameTimeScale()
		}
	}
	return 300 / gameTimeScale()
}

// formScore is the last-5 win-minus-loss share.
func formScore(form map[string]any) float64 {
	recent := []string{}
	if list, ok := form["recent"].([]any); ok {
		for i, v := range list {
			if i >= 5 {
				break
			}
			if s, ok := v.(string); ok {
				recent = append(recent, s)
			}
		}
	}
	if len(recent) == 0 {
		return 0
	}
	w, l := 0, 0
	for _, r := range recent {
		if r == "W" {
			w++
		}
		if r == "L" {
			l++
		}
	}
	return float64(w-l) / 5
}

func (r *Repository) standsCapacity(ctx context.Context, clubID string) (float64, error) {
	row, _, err := r.one(ctx, `SELECT "Level" AS n FROM "ClubAssets" WHERE "ClubId" = $1 AND "AssetType" = 'stands' LIMIT 1`, clubID)
	if err != nil {
		return 0, err
	}
	level := 0
	if row != nil {
		level = intOf(row["n"])
	}
	return facilities.Effects(facilities.Stands, level)["capacity"], nil
}

// applyGate credits the home side's matchday receipts and returns the gate.
func (r *Repository) applyGate(ctx context.Context, club map[string]any, homeGoals, awayGoals int) (map[string]any, error) {
	clubID := db.StringField(club, "_id")
	capacity, err := r.standsCapacity(ctx, clubID)
	if err != nil {
		return nil, err
	}
	fans := numOf(club["Fans"])
	pull := math.Min(fans/math.Max(capacity, 1), 1.2)
	base := math.Min(0.3+0.55*pull, 1)
	formMod := formScore(mapOf(club["Form"])) * 0.12
	noise := (rand.Float64() - 0.5) * 0.08
	fill := clampF(base+formMod+noise, 0.2, 1)
	attendance := math.Round(capacity * fill)
	revenue := attendance * 28
	costs := math.Round(attendance*6 + 1000 + capacity*0.5)
	net := revenue - costs

	finances := mapOf(club["Finances"])
	if finances == nil {
		finances = map[string]any{}
	}
	totalRev := numOf(finances["totalMatchdayRevenue"]) + revenue
	totalCost := numOf(finances["totalMatchdayCosts"]) + costs
	history, _ := finances["history"].([]any)
	entry := map[string]any{
		"fixtureId": "", "date": time.Now(), "attendance": attendance, "capacity": capacity,
		"revenue": revenue, "costs": costs, "net": net,
	}
	history = append([]any{entry}, history...)
	if len(history) > 25 {
		history = history[:25]
	}
	finances["totalMatchdayRevenue"] = totalRev
	finances["totalMatchdayCosts"] = totalCost
	finances["history"] = history
	rawFin, _ := json.Marshal(finances)
	if _, err := r.q.Exec(ctx, `UPDATE "Clubs" SET "Budget" = coalesce("Budget",0) + $2, "Finances" = $3::jsonb, "updatedAt" = now() WHERE "_id" = $1`,
		clubID, net, string(rawFin)); err != nil {
		return nil, err
	}
	return map[string]any{"attendance": attendance, "revenue": revenue, "costs": costs, "net": net}, nil
}

func (r *Repository) payRewards(ctx context.Context, clubID string, cash, xp float64, note string) error {
	if _, err := r.q.Exec(ctx, `UPDATE "Clubs" SET "Budget" = coalesce("Budget",0) + $2, "XP" = coalesce("XP",0) + $3, "updatedAt" = now() WHERE "_id" = $1`,
		clubID, cash, xp); err != nil {
		return err
	}
	if cash > 0 {
		if _, err := db.InsertRow(ctx, r.q, "TransferLedger", map[string]any{
			"Type": "match_reward", "BuyerClubId": clubID, "Amount": cash, "Note": note, "updatedAt": time.Now(),
		}); err != nil {
			return err
		}
	}
	return nil
}

// applyStanding prepends the result to the club's recent form.
func (r *Repository) applyStanding(ctx context.Context, club map[string]any, outcome string) error {
	letter := map[string]string{"win": "W", "draw": "D", "loss": "L"}[outcome]
	form := mapOf(club["Form"])
	if form == nil {
		form = map[string]any{}
	}
	recent, _ := form["recent"].([]any)
	recent = append([]any{letter}, recent...)
	if len(recent) > 5 {
		recent = recent[:5]
	}
	form["recent"] = recent
	raw, _ := json.Marshal(form)
	_, err := r.q.Exec(ctx, `UPDATE "Clubs" SET "Form" = $2::jsonb, "updatedAt" = now() WHERE "_id" = $1`, db.StringField(club, "_id"), string(raw))
	return err
}

func highlightsOf(events any, club map[string]any, home, away int) []any {
	list, _ := events.([]any)
	key := map[string]bool{"goal": true, "save": true, "shot": true, "foul": true, "tackle": true}
	out := []any{}
	for _, e := range list {
		ev, _ := e.(map[string]any)
		if ev == nil {
			continue
		}
		typ := db.StringField(ev, "type")
		msg := db.StringField(ev, "message")
		isGoal := typ == "goal" || strings.Contains(strings.ToLower(msg), "goal")
		if !key[typ] && !isGoal {
			continue
		}
		minute := 0
		if t, ok := ev["time"].(string); ok {
			digits := ""
			for _, ch := range t {
				if ch >= '0' && ch <= '9' {
					digits += string(ch)
				} else if digits != "" {
					break
				}
			}
			if n, err := strconv.Atoi(digits); err == nil {
				minute = n
			}
		}
		if minute < 1 {
			minute = rand.Intn(85) + 5
		}
		if minute > 90 {
			minute = 90
		}
		side := "them"
		if code := db.StringField(ev, "playerTeamID"); code != "" {
			if code == db.StringField(club, "ClubCode") {
				side = "you"
			}
		} else if db.StringField(ev, "side") == "home" {
			side = "you"
		}
		if msg == "" {
			msg = "Key match event"
		}
		out = append(out, map[string]any{"minute": minute, "type": typ, "message": msg, "side": side})
	}
	sort.SliceStable(out, func(i, j int) bool {
		return intOf(out[i].(map[string]any)["minute"]) < intOf(out[j].(map[string]any)["minute"])
	})
	if len(out) > 15 {
		out = out[:15]
	}
	return out
}

func randUUID() string {
	var b [16]byte
	for i := range b {
		b[i] = byte(rand.Intn(256))
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func (r *Repository) clubPlayers(ctx context.Context, clubID string) ([]any, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Players" WHERE "ClubId" = $1 AND "isSigned" = true AND "isRetired" = false`, clubID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := make([]any, 0, len(list))
	for _, p := range list {
		out = append(out, map[string]any{
			"_id": db.StringField(p, "_id"), "FirstName": db.StringField(p, "FirstName"),
			"LastName": db.StringField(p, "LastName"), "Position": db.StringField(p, "Position"),
			"Rating": p["Rating"], "Attributes": p["Attributes"], "Stamina": p["Stamina"],
			"Fitness": p["Fitness"], "ShirtNumber": p["ShirtNumber"], "Role": p["Role"],
			"Injury": p["Injury"], "MoraleValue": p["MoraleValue"],
		})
	}
	return out, nil
}

func tacticOf(club map[string]any) map[string]any {
	t, _ := club["Tactic"].(map[string]any)
	if t == nil {
		t = map[string]any{}
	}
	formation := db.StringField(t, "formationName")
	if formation == "" {
		formation = "4-3-3"
	}
	style := db.StringField(t, "styleName")
	if style == "" {
		style = "Balanced"
	}
	return map[string]any{"formationName": formation, "styleName": style}
}

func (r *Repository) buildSimRequest(ctx context.Context, fixtureID string, home, away map[string]any, watch bool) (map[string]any, error) {
	homePlayers, err := r.clubPlayers(ctx, db.StringField(home, "_id"))
	if err != nil {
		return nil, err
	}
	awayPlayers, err := r.clubPlayers(ctx, db.StringField(away, "_id"))
	if err != nil {
		return nil, err
	}
	clubJSON := func(c map[string]any, players []any) map[string]any {
		return map[string]any{
			"_id": db.StringField(c, "_id"), "Name": db.StringField(c, "Name"),
			"ClubCode": db.StringField(c, "ClubCode"), "ManagerId": nullableString2(db.StringField(c, "ManagerId")),
			"Tactic": tacticOf(c), "Players": players, "Lineup": c["Lineup"],
		}
	}
	return map[string]any{
		"fixtureId":     fixtureID,
		"seed":          randUUID(),
		"sides":         map[string]any{"home": db.StringField(home, "_id"), "away": db.StringField(away, "_id")},
		"clubs":         []any{clubJSON(home, homePlayers), clubJSON(away, awayPlayers)},
		"tactics":       map[string]any{"home": tacticOf(home), "away": tacticOf(away)},
		"fixtureType":   "friendly",
		"stage":         "friendly",
		"isKnockout":    false,
		"includeFrames": watch,
	}, nil
}

func nullableString2(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// PlayMatch runs the full PLAY loop for a club. It returns the MatchResult
// without `state`; the caller adds the fresh PlayState.
func (r *Repository) PlayMatch(ctx context.Context, clubID, opponentID string, watch bool) (map[string]any, error) {
	club, ok, err := r.one(ctx, `SELECT * FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("Club not found")
	}
	// PLAY gate: a manager and a legal matchday squad.
	managed, _, err := r.one(ctx, `SELECT "_id" FROM "Managers" WHERE "ClubId" = $1 AND "isEmployed" = true LIMIT 1`, clubID)
	if err != nil {
		return nil, err
	}
	if managed == nil {
		return nil, PlayGateError{"Sign a manager before you play"}
	}
	fitCount, _, err := r.one(ctx, `SELECT count(*)::int AS n FROM "Players" WHERE "ClubId" = $1 AND "isSigned" = true AND "isRetired" = false AND ("Injury" IS NULL OR ("Injury"->>'daysRemaining')::int <= 0)`, clubID)
	if err != nil {
		return nil, err
	}
	if fitCount == nil || intOf(fitCount["n"]) < 11 {
		return nil, PlayGateError{"You need a legal matchday squad (11 fit players) before you play"}
	}

	cool, err := r.matchCooldown(ctx, clubID)
	if err != nil {
		return nil, err
	}
	if cool > 0 {
		return nil, fmt.Errorf("Your squad is resting - next match in %ds", cool)
	}

	candidates, err := r.opponentCandidates(ctx, club)
	if err != nil {
		return nil, err
	}
	if len(candidates) == 0 {
		return nil, fmt.Errorf("No opponent available right now")
	}
	order := candidates
	if opponentID != "" {
		var chosen map[string]any
		for _, c := range candidates {
			if db.StringField(c, "_id") == opponentID {
				chosen = c
			}
		}
		if chosen == nil {
			return nil, fmt.Errorf("That opponent is no longer available - search again")
		}
		order = []map[string]any{chosen}
	}

	currentDay, err := r.currentDayOf(ctx)
	if err != nil {
		return nil, err
	}

	var fixtureID string
	var opponent map[string]any
	var matchData map[string]any
	var lastErr error
	for _, cand := range order {
		opponent = cand
		fx, err := db.InsertRow(ctx, r.q, "Fixtures", map[string]any{
			"Title": fmt.Sprintf("%s vs %s %s", db.StringField(club, "Name"), db.StringField(cand, "Name"), matchTitleMark),
			"Home":  db.StringField(club, "ClubCode"), "Away": db.StringField(cand, "ClubCode"),
			"HomeTeamId": clubID, "AwayTeamId": db.StringField(cand, "_id"),
			"Type": "friendly", "Stage": "friendly", "Played": false, "SaveStats": true,
			"SeasonId": nil, "ScheduledDay": currentDay, "updatedAt": time.Now(),
		})
		if err != nil {
			return nil, err
		}
		id := db.StringField(fx, "_id")
		req, err := r.buildSimRequest(ctx, id, club, cand, watch)
		if err != nil {
			return nil, err
		}
		match, err := clients.SimulateMatch(ctx, req)
		if err != nil {
			lastErr = err
			continue
		}
		fixtureID, matchData = id, match
		break
	}
	if fixtureID == "" {
		return nil, fmt.Errorf("Could not play a match: %v", lastErr)
	}

	details, _ := matchData["Details"].(map[string]any)
	events := matchData["Events"]
	if details == nil {
		details = map[string]any{}
	}
	home, away := intOf(details["HomeTeamScore"]), intOf(details["AwayTeamScore"])
	outcome := "draw"
	if home > away {
		outcome = "win"
	} else if home < away {
		outcome = "loss"
	}
	rawDetails, _ := json.Marshal(details)
	rawEvents, _ := json.Marshal(events)
	if _, err := r.q.Exec(ctx, `UPDATE "Fixtures" SET "Played" = true, "Details" = $2::jsonb, "Events" = $3::jsonb, "PlayedAt" = now(), "updatedAt" = now() WHERE "_id" = $1`,
		fixtureID, string(rawDetails), string(rawEvents)); err != nil {
		return nil, err
	}

	// Gate receipts for the home side, then the result rewards.
	gate, err := r.applyGate(ctx, club, home, away)
	if err != nil {
		return nil, err
	}
	gateNet := 0.0
	if gate != nil {
		gateNet = numOf(gate["net"])
	}
	rewardCash := math.Round(gateNet * map[string]float64{"win": 0.5, "draw": 0.1, "loss": -0.15}[outcome])
	if outcome == "win" && rewardCash < 3000 {
		rewardCash = 3000
	}
	rewardXP := rewardXPValue(outcome)
	if err := r.payRewards(ctx, clubID, rewardCash, rewardXP, fmt.Sprintf("%s %d-%d %s", db.StringField(club, "Name"), home, away, db.StringField(opponent, "Name"))); err != nil {
		return nil, err
	}
	if err := r.applyStanding(ctx, club, outcome); err != nil {
		return nil, err
	}

	if watch {
		homeRef := map[string]any{"id": clubID, "name": db.StringField(club, "Name"), "code": db.StringField(club, "ClubCode")}
		awayRef := map[string]any{"id": db.StringField(opponent, "_id"), "name": db.StringField(opponent, "Name"), "code": db.StringField(opponent, "ClubCode")}
		if _, err := db.InsertRow(ctx, r.q, "MatchReplays", map[string]any{
			"FixtureId": fixtureID, "Home": homeRef, "Away": awayRef,
			"Frames": matchData["Frames"], "Details": details, "TickMs": 300, "updatedAt": time.Now(),
		}); err != nil {
			return nil, err
		}
	}

	var gateOut any
	if gate != nil {
		gateOut = gate
	}
	return map[string]any{
		"fixtureId": fixtureID,
		"opponent": map[string]any{
			"id": db.StringField(opponent, "_id"), "name": db.StringField(opponent, "Name"),
			"code": db.StringField(opponent, "ClubCode"), "power": powerOf(db.StringField(opponent, "ClubCode"), opponent),
			"human": opponent["UserId"] != nil, "manager": opponent["manager"],
		},
		"score":              map[string]any{"you": home, "them": away},
		"outcome":            outcome,
		"rewards":            map[string]any{"cash": rewardCash, "xp": rewardXP},
		"gate":               gateOut,
		"challengeCompleted": false,
		"standingChange":     map[string]any{"fans": 0, "reputation": 0, "boardConfidence": 0},
		"highlights":         highlightsOf(events, club, home, away),
	}, nil
}

func powerOf(_ string, club map[string]any) int {
	return int(math.Round(numOf(club["Rating"]) * 2.5))
}

func rewardXPValue(outcome string) float64 { return rewardXP[outcome] }

func (r *Repository) opponentCandidates(ctx context.Context, club map[string]any) ([]map[string]any, error) {
	rows, err := r.q.Query(ctx, `SELECT c.*, u."FullName" AS "manager"
		FROM "Clubs" c LEFT JOIN "Users" u ON u."_id" = c."UserId"
		WHERE c."_id" <> $1 AND c."ReleasedAt" IS NULL
		  AND ($2::uuid IS NULL OR c."UserId" IS NULL OR c."UserId" <> $2::uuid)
		  AND (c."UserId" IS NULL OR c."ShieldUntil" IS NULL OR c."ShieldUntil" < now())
		ORDER BY abs(coalesce(c."Rating",0) - $3), c."_id" LIMIT 5`, db.StringField(club, "_id"), nullableString2(db.StringField(club, "UserId")), numOf(club["Rating"]))
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

func (r *Repository) matchCooldown(ctx context.Context, clubID string) (int, error) {
	row, _, err := r.one(ctx, `SELECT f."PlayedAt" AS "playedAt" FROM "Fixtures" f
		WHERE f."HomeTeamId" = $1 AND f."Played" = true AND f."Title" LIKE '%' || $2
		ORDER BY f."PlayedAt" DESC NULLS LAST LIMIT 1`, clubID, matchTitleMark)
	if err != nil {
		return 0, err
	}
	if row == nil || row["playedAt"] == nil {
		return 0, nil
	}
	t, err := time.Parse("2006-01-02T15:04:05.000Z", db.StringField(row, "playedAt"))
	if err != nil {
		return 0, nil
	}
	left := cooldownBaseSeconds() - time.Since(t).Seconds()
	if left < 0 {
		return 0, nil
	}
	return int(math.Ceil(left)), nil
}

func (r *Repository) currentDayOf(ctx context.Context) (int, error) {
	row, _, err := r.one(ctx, `SELECT "CurrentDay" AS n FROM "Calendars" LIMIT 1`)
	if err != nil {
		return 0, err
	}
	if row == nil {
		return 0, nil
	}
	return intOf(row["n"]), nil
}

// PayGateError and PlayGateError signal a 409.
type PlayGateError struct{ Message string }

func (e PlayGateError) Error() string { return e.Message }
