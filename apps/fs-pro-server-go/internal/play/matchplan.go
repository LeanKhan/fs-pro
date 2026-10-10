package play

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"fs-pro-server/internal/clients"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/grid"
)

// Match-day plan, ported from services/play/match-plan.service.ts +
// plan-effects.ts.

const (
	bookedStage       = "booked"
	maxBookings       = 2
	previewRuns       = 40
	previewFixtureTag = "preview-"
)

var planFormations = []string{"433", "442", "4231", "352", "343", "532", "541", "4141", "451", "41212"}
var styleKeys = []string{"Balanced", "HighPress", "Possession", "LowBlock", "Direct"}

var counterCycle = []string{"HighPress", "Possession", "LowBlock", "Direct"}

var noHalfTime = map[string]any{"losing": nil, "drawing": nil, "winning": nil}

// PrepError carries an HTTP status.
type PrepError struct {
	Message string
	Status  int
}

func (e PrepError) Error() string { return e.Message }

func prepErr(msg string) PrepError { return PrepError{msg, 400} }

func styleKey(name any) string {
	clean := strings.ToLower(strings.NewReplacer(" ", "", "_", "", "-", "").Replace(fmt.Sprintf("%v", name)))
	for _, k := range styleKeys {
		if strings.ToLower(k) == clean {
			return k
		}
	}
	return "Balanced"
}

func styleMatchup(own, opp string) int {
	a, b := -1, -1
	for i, s := range counterCycle {
		if s == own {
			a = i
		}
		if s == opp {
			b = i
		}
	}
	if a < 0 || b < 0 {
		return 0
	}
	if (a+1)%4 == b {
		return 1
	}
	if (b+1)%4 == a {
		return -1
	}
	return 0
}

func counterTo(style string) any {
	for i, s := range counterCycle {
		if s == style {
			return counterCycle[(i+3)%4]
		}
	}
	return nil
}

func labelStyle(s string) string {
	var b strings.Builder
	for i, r := range s {
		if i > 0 && r >= 'A' && r <= 'Z' {
			b.WriteByte(' ')
		}
		b.WriteRune(r)
	}
	return b.String()
}

func parseSideTactic(raw any) map[string]any {
	if raw == nil {
		return nil
	}
	if m, ok := raw.(map[string]any); ok {
		return m
	}
	s, ok := raw.(string)
	if !ok || s == "" {
		return nil
	}
	out := map[string]any{}
	if err := json.Unmarshal([]byte(s), &out); err != nil {
		return nil
	}
	return out
}

func planTactic(plan map[string]any) map[string]any {
	sliders := mapOf(plan["sliders"])
	out := map[string]any{
		"formationName": db.StringField(plan, "formation"),
		"styleName":     db.StringField(plan, "style"),
		"halfTime":      plan["halfTime"],
		"plan":          plan,
	}
	if sliders != nil {
		if sliders["pressing"] != nil {
			out["pressingIntensity"] = sliders["pressing"]
		}
		if sliders["line"] != nil {
			out["defensiveLineHeight"] = sliders["line"]
		}
		if sliders["width"] != nil {
			out["width"] = sliders["width"]
		}
		if sliders["tempo"] != nil {
			out["tempo"] = sliders["tempo"]
		}
		if sliders["directness"] != nil {
			out["directness"] = sliders["directness"]
		}
	}
	return out
}

func (r *Repository) world(ctx context.Context) (map[string]any, error) {
	row, ok, err := r.one(ctx, `SELECT * FROM "Calendars" LIMIT 1`)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, prepErr("The game world has not been set up")
	}
	return row, nil
}

func dayKindOf(w map[string]any, day int) string {
	template := []string{"L", "C", "L", "L", "C", "L", "L"}
	if t := anyToStrings(w["WeekTemplate"]); len(t) > 0 {
		template = t
	}
	start := intOf(w["YearStartDay"])
	n := len(template)
	i := ((day-start)%n + n) % n
	return template[i]
}

func anyToStrings(v any) []string {
	list, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(list))
	for _, x := range list {
		if s, ok := x.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func nextCupDay(w map[string]any, day int) (int, bool) {
	for d := day; d <= day+60; d++ {
		if dayKindOf(w, d) == "C" {
			return d, true
		}
	}
	return 0, false
}

func kickoffOf(f, w map[string]any) (int, any, bool) {
	hour := 20
	if f["KickoffHour"] != nil {
		hour = intOf(f["KickoffHour"])
	} else if w["CupKickoffHour"] != nil {
		hour = intOf(w["CupKickoffHour"])
	}
	var day *int
	if f["ScheduledDay"] != nil {
		d := intOf(f["ScheduledDay"])
		day = &d
	}
	var startsIn any
	passed := boolOf2(f["Played"])
	if day == nil {
		return hour, nil, passed
	}
	gameHours := (*day-intOf(w["CurrentDay"]))*24 + (hour - intOf(w["CurrentHour"]))
	if boolOf2(f["Played"]) || gameHours <= 0 {
		passed = true
	}
	if w["ClockMode"] == "live" && !boolOf2(f["Played"]) {
		secs := math.Max(0, math.Round(float64(gameHours)*((numOf(w["DayLengthMinutes"])*60)/24)))
		startsIn = secs
	}
	return hour, startsIn, passed
}

func boolOf2(v any) bool { b, _ := v.(bool); return b }

func kindOf(f map[string]any) string {
	switch db.StringField(f, "Stage") {
	case bookedStage:
		return "booked"
	case "lg-match":
		return "league"
	case "open-match":
		return "challenge"
	}
	if db.StringField(f, "SeasonId") != "" {
		return "cup"
	}
	return "friendly"
}

func scoresPair(details any) (int, int) {
	d := mapOf(details)
	return intOf(d["HomeTeamScore"]), intOf(d["AwayTeamScore"])
}

func (r *Repository) toMatchdayFixture(ctx context.Context, f map[string]any, clubID string, w map[string]any) (map[string]any, error) {
	home := db.StringField(f, "HomeTeamId") == clubID
	oppID := db.StringField(f, "HomeTeamId")
	if home {
		oppID = db.StringField(f, "AwayTeamId")
	}
	opp, _, _ := r.one(ctx, `SELECT "_id","Name","ClubCode","Rating","UserId" FROM "Clubs" WHERE "_id" = $1`, oppID)
	hour, startsIn, _ := kickoffOf(f, w)
	title := strings.TrimSpace(strings.NewReplacer(" (Booked)", "", " (Matchmade)", "").Replace(db.StringField(f, "Title")))
	var score any
	if boolOf2(f["Played"]) {
		h, a := scoresPair(f["Details"])
		if home {
			score = map[string]any{"you": h, "them": a}
		} else {
			score = map[string]any{"you": a, "them": h}
		}
	}
	tacticCol := "AwayTactic"
	if home {
		tacticCol = "HomeTactic"
	}
	planSet := false
	if st := parseSideTactic(f[tacticCol]); st != nil && st["plan"] != nil {
		planSet = true
	}
	replay, _, _ := r.one(ctx, `SELECT "_id" FROM "MatchReplays" WHERE "FixtureId" = $1`, db.StringField(f, "_id"))
	oppOut := map[string]any{"id": oppID, "name": "?", "code": "?", "power": 0, "human": false}
	if opp != nil {
		oppOut = map[string]any{"id": oppID, "name": db.StringField(opp, "Name"), "code": db.StringField(opp, "ClubCode"), "power": int(math.Round(numOf(opp["Rating"]) * 2.5)), "human": opp["UserId"] != nil}
	}
	var playedAt any
	if f["PlayedAt"] != nil {
		playedAt = f["PlayedAt"]
	}
	return map[string]any{
		"fixtureId": db.StringField(f, "_id"), "kind": kindOf(f), "title": title, "home": home,
		"opponent": oppOut, "day": f["ScheduledDay"], "kickoffHour": hour,
		"startsInSeconds": startsIn, "played": boolOf2(f["Played"]), "playedAt": playedAt,
		"score": score, "planSet": planSet, "hasReplay": replay != nil,
	}, nil
}

func (r *Repository) myFixture(ctx context.Context, clubID, fixtureID string) (map[string]any, bool, error) {
	f, ok, err := r.one(ctx, `SELECT * FROM "Fixtures" WHERE "_id" = $1`, fixtureID)
	if err != nil {
		return nil, false, err
	}
	if !ok {
		return nil, false, PrepError{"Match not found", 404}
	}
	home := db.StringField(f, "HomeTeamId") == clubID
	if !home && db.StringField(f, "AwayTeamId") != clubID {
		return nil, false, PrepError{"Your club is not playing in this match", 403}
	}
	return f, home, nil
}

func clubDefaultPlan(club map[string]any) map[string]any {
	t := mapOf(club["Tactic"])
	if t == nil {
		t = map[string]any{}
	}
	formation := db.StringField(t, "formationName")
	if !contains2(planFormations, formation) {
		formation = "433"
	}
	lineup := mapOf(club["Lineup"])
	var xi, bench []any
	if lineup != nil {
		xi, _ = lineup["startingXI"].([]any)
		bench, _ = lineup["bench"].([]any)
	}
	if xi == nil {
		xi = []any{}
	}
	if bench == nil {
		bench = []any{}
	}
	ht := mapOf(t["halfTime"])
	if ht == nil {
		ht = noHalfTime
	}
	sliders := mapOf(t["sliders"])
	if sliders == nil {
		sliders = map[string]any{}
	}
	return map[string]any{
		"formation": formation, "style": styleKey(t["styleName"]), "sliders": sliders,
		"startingXI": xi, "bench": bench, "halfTime": ht, "training": "none", "teamTalk": "calm",
	}
}

func contains2(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

func (r *Repository) sidePlan(f map[string]any, home bool, club map[string]any) (map[string]any, bool) {
	col := "AwayTactic"
	if home {
		col = "HomeTactic"
	}
	stored := parseSideTactic(f[col])
	if stored != nil {
		if p := mapOf(stored["plan"]); p != nil {
			return p, true
		}
	}
	return clubDefaultPlan(club), false
}

func (r *Repository) tiers(ctx context.Context, clubID string) (map[string]any, error) {
	rows, err := r.q.Query(ctx, `SELECT "AssetType","Level" FROM "ClubAssets" WHERE "ClubId" = $1`, clubID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	of := func(t string) int {
		for _, row := range list {
			if db.StringField(row, "AssetType") == t {
				return intOf(row["Level"])
			}
		}
		return 0
	}
	return map[string]any{"trainingTier": of("training_ground"), "scoutingTier": of("scouting"), "medicalTier": of("medical_centre")}, nil
}

func (r *Repository) squadOf(ctx context.Context, clubID string) ([]any, error) {
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
		first := db.StringField(p, "FirstName")
		initial := ""
		if r := []rune(first); len(r) > 0 {
			initial = string(r[0])
		}
		out = append(out, map[string]any{
			"id": db.StringField(p, "_id"), "name": strings.TrimSpace(initial + ". " + db.StringField(p, "LastName")),
			"position": orString(db.StringField(p, "Position"), "?"), "rating": int(math.Round(numOf(p["Rating"]))),
			"fitness": int(math.Round(orFloat(p["Fitness"], 100))), "morale": orFloat(p["MoraleValue"], 60),
			"injured": injuryDays(p["Injury"]) > 0,
		})
	}
	// sort by rating desc
	sortAnyByRating(out)
	return out, nil
}

func orString(s, fallback string) string {
	if s == "" {
		return fallback
	}
	return s
}
func orFloat(v any, fallback float64) float64 {
	if v == nil {
		return fallback
	}
	return numOf(v)
}
func injuryDays(v any) int {
	m := mapOf(v)
	if m == nil {
		return 0
	}
	return intOf(m["daysRemaining"])
}

func sortAnyByRating(list []any) {
	for i := 1; i < len(list); i++ {
		for j := i; j > 0; j-- {
			a := list[j].(map[string]any)
			b := list[j-1].(map[string]any)
			if intOf(a["rating"]) > intOf(b["rating"]) {
				list[j], list[j-1] = list[j-1], list[j]
			} else {
				break
			}
		}
	}
}

func (r *Repository) scoutReport(ctx context.Context, f map[string]any, home bool, scoutingTier int) (map[string]any, error) {
	oppID := db.StringField(f, "HomeTeamId")
	if home {
		oppID = db.StringField(f, "AwayTeamId")
	}
	opp, ok, err := r.one(ctx, `SELECT * FROM "Clubs" WHERE "_id" = $1`, oppID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, PrepError{"Opponent not found", 404}
	}
	theirPlan, _ := r.sidePlan(f, !home, opp)
	var style any
	if scoutingTier >= 1 {
		style = db.StringField(theirPlan, "style")
	}
	notes := []any{}
	ht := mapOf(theirPlan["halfTime"])
	if scoutingTier >= 3 && ht != nil && (ht["losing"] != nil || ht["drawing"] != nil || ht["winning"] != nil) {
		if ht["losing"] != nil {
			notes = append(notes, fmt.Sprintf("If they're losing at half time they switch to %s.", labelStyle(db.StringField(ht, "losing"))))
		}
		if ht["winning"] != nil {
			notes = append(notes, fmt.Sprintf("If they're winning at half time they switch to %s.", labelStyle(db.StringField(ht, "winning"))))
		}
	}
	if scoutingTier == 0 {
		notes = append(notes, "Build a Scouting Department to learn how they play.")
	} else if scoutingTier < 2 {
		notes = append(notes, "A better Scouting Department names their key players.")
	}
	squad, err := r.squadOf(ctx, oppID)
	if err != nil {
		return nil, err
	}
	tired := 0
	for _, p := range squad {
		if intOf(p.(map[string]any)["fitness"]) < 75 {
			tired++
		}
	}
	if scoutingTier >= 2 && tired >= 3 {
		notes = append(notes, fmt.Sprintf("%d of their players are short of fitness.", tired))
	}
	keyPlayers := []any{}
	if scoutingTier >= 2 {
		for i, p := range squad {
			if i >= 3 {
				break
			}
			pm := p.(map[string]any)
			keyPlayers = append(keyPlayers, map[string]any{"name": pm["name"], "position": pm["position"], "rating": pm["rating"]})
		}
	}
	formOut := []any{}
	if opp["Form"] != nil {
		if recent, ok := mapOf(opp["Form"])["recent"].([]any); ok {
			for i, v := range recent {
				if i >= 5 {
					break
				}
				formOut = append(formOut, v)
			}
		}
	}
	var counter any
	if style != nil {
		counter = counterTo(db.StringField(theirPlan, "style"))
	}
	return map[string]any{
		"level": scoutingTier, "power": int(math.Round(numOf(opp["Rating"]) * 2.5)),
		"formation": theirPlan["formation"], "style": style, "counter": counter,
		"keyPlayers": keyPlayers, "form": formOut, "notes": notes,
	}, nil
}

// GetMatchPrep is GET /api/play/{clubId}/fixtures/{fixtureId}/prep.
func (r *Repository) GetMatchPrep(ctx context.Context, clubID, fixtureID string) (map[string]any, error) {
	f, home, err := r.myFixture(ctx, clubID, fixtureID)
	if err != nil {
		return nil, err
	}
	club, ok, err := r.one(ctx, `SELECT * FROM "Clubs" WHERE "_id" = $1`, clubID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, PrepError{"Club not found", 404}
	}
	w, err := r.world(ctx)
	if err != nil {
		return nil, err
	}
	fixture, err := r.toMatchdayFixture(ctx, f, clubID, w)
	if err != nil {
		return nil, err
	}
	plan, _ := r.sidePlan(f, home, club)
	t, err := r.tiers(ctx, clubID)
	if err != nil {
		return nil, err
	}
	squad, err := r.squadOf(ctx, clubID)
	if err != nil {
		return nil, err
	}
	scout, err := r.scoutReport(ctx, f, home, intOf(t["scoutingTier"]))
	if err != nil {
		return nil, err
	}
	_, _, passed := kickoffOf(f, w)
	return map[string]any{
		"fixture": fixture, "plan": plan, "locked": passed, "squad": squad,
		"scout": scout, "facilities": t, "myPower": int(math.Round(numOf(club["Rating"]) * 2.5)),
	}, nil
}

func checkPlan(plan map[string]any, squadIDs map[string]bool) error {
	xiRaw, _ := plan["startingXI"].([]any)
	xi := []string{}
	for _, v := range xiRaw {
		if s, ok := v.(string); ok && s != "" {
			xi = append(xi, s)
		}
	}
	seen := map[string]bool{}
	for _, id := range xi {
		if seen[id] {
			return prepErr("A player is picked twice")
		}
		seen[id] = true
	}
	bench, _ := plan["bench"].([]any)
	for _, v := range append(append([]any{}, xiRaw...), bench...) {
		s, _ := v.(string)
		if s != "" && !squadIDs[s] {
			return prepErr("Pick only players from your squad")
		}
	}
	if len(xi) != 0 && len(xi) != 11 {
		return prepErr("Pick a full XI (or none, to use your saved team sheet)")
	}
	return nil
}

// SaveMatchPlan is PUT .../plan.
func (r *Repository) SaveMatchPlan(ctx context.Context, clubID, fixtureID string, plan map[string]any, asDefault bool) (map[string]any, error) {
	f, home, err := r.myFixture(ctx, clubID, fixtureID)
	if err != nil {
		return nil, err
	}
	w, err := r.world(ctx)
	if err != nil {
		return nil, err
	}
	if _, _, passed := kickoffOf(f, w); passed {
		return nil, prepErr("This match has kicked off: the plan is locked")
	}
	squad, err := r.squadOf(ctx, clubID)
	if err != nil {
		return nil, err
	}
	ids := map[string]bool{}
	for _, p := range squad {
		ids[db.StringField(p.(map[string]any), "id")] = true
	}
	if err := checkPlan(plan, ids); err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(planTactic(plan))
	col := "AwayTactic"
	if home {
		col = "HomeTactic"
	}
	if _, err := r.q.Exec(ctx, `UPDATE "Fixtures" SET "`+col+`" = $2, "updatedAt" = now() WHERE "_id" = $1`, fixtureID, string(raw)); err != nil {
		return nil, err
	}
	if asDefault {
		tacticUpdate := map[string]any{
			"formationName": db.StringField(plan, "formation"), "styleName": db.StringField(plan, "style"),
			"sliders": plan["sliders"], "halfTime": plan["halfTime"],
		}
		rawT, _ := json.Marshal(tacticUpdate)
		xiRaw, _ := plan["startingXI"].([]any)
		if len(xiRaw) > 0 {
			lineup, _ := json.Marshal(map[string]any{"startingXI": plan["startingXI"], "bench": plan["bench"]})
			if _, err := r.q.Exec(ctx, `UPDATE "Clubs" SET "Tactic" = $2::jsonb, "Lineup" = $3::jsonb, "updatedAt" = now() WHERE "_id" = $1`, clubID, string(rawT), string(lineup)); err != nil {
				return nil, err
			}
		} else if _, err := r.q.Exec(ctx, `UPDATE "Clubs" SET "Tactic" = $2::jsonb, "updatedAt" = now() WHERE "_id" = $1`, clubID, string(rawT)); err != nil {
			return nil, err
		}
	}
	return r.GetMatchPrep(ctx, clubID, fixtureID)
}

// PreviewMatchPlan is POST .../preview: the engine plays the plan 40 times.
func (r *Repository) PreviewMatchPlan(ctx context.Context, clubID, fixtureID string, plan map[string]any) (map[string]any, error) {
	f, home, err := r.myFixture(ctx, clubID, fixtureID)
	if err != nil {
		return nil, err
	}
	squad, err := r.squadOf(ctx, clubID)
	if err != nil {
		return nil, err
	}
	ids := map[string]bool{}
	for _, p := range squad {
		ids[db.StringField(p.(map[string]any), "id")] = true
	}
	if err := checkPlan(plan, ids); err != nil {
		return nil, err
	}
	homeID, awayID := db.StringField(f, "HomeTeamId"), db.StringField(f, "AwayTeamId")
	me, _, _ := r.one(ctx, `SELECT * FROM "Clubs" WHERE "_id" = $1`, clubID)
	oppID := homeID
	if home {
		oppID = awayID
	}
	opp, _, _ := r.one(ctx, `SELECT * FROM "Clubs" WHERE "_id" = $1`, oppID)
	if me == nil || opp == nil {
		return nil, PrepError{"Club not found", 404}
	}
	mine := planTactic(plan)
	theirPlan, saved := r.sidePlan(f, !home, opp)
	theirTactic := planTactic(theirPlan)
	if !saved {
		if t := mapOf(opp["Tactic"]); t != nil {
			theirTactic = t
		}
	}
	homeTactic, awayTactic := mine, theirTactic
	if !home {
		homeTactic, awayTactic = theirTactic, mine
	}
	base, err := r.buildSimRequestWithTactics(ctx, previewFixtureTag+fixtureID, homeID, awayID, me, opp, homeTactic, awayTactic, false)
	if err != nil {
		return nil, err
	}
	seed := db.StringField(base, "seed")
	batch := make([]map[string]any, 0, previewRuns)
	for i := 0; i < previewRuns; i++ {
		reqCopy := map[string]any{}
		for k, v := range base {
			reqCopy[k] = v
		}
		reqCopy["seed"] = fmt.Sprintf("%s-%d", seed, i)
		batch = append(batch, reqCopy)
	}
	results, err := clients.SimulateBatch(ctx, batch)
	if err != nil {
		return nil, prepErr("The assistant could not run the numbers right now - try again")
	}
	w, d, l, gf, ga, n := 0, 0, 0, 0, 0, 0
	for _, res := range results {
		if ok, _ := res["ok"].(bool); !ok {
			continue
		}
		det := mapOf(mapOf(res["match"])["Details"])
		if det == nil {
			continue
		}
		yours, theirs := intOf(det["AwayTeamScore"]), intOf(det["HomeTeamScore"])
		if home {
			yours, theirs = intOf(det["HomeTeamScore"]), intOf(det["AwayTeamScore"])
		}
		n++
		gf += yours
		ga += theirs
		if yours > theirs {
			w++
		} else if yours == theirs {
			d++
		} else {
			l++
		}
	}
	if n == 0 {
		return nil, prepErr("The assistant could not run the numbers right now - try again")
	}
	factors, err := r.planFactors(ctx, plan, me, opp, home, squad, db.StringField(theirPlan, "style"))
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"runs": n, "win": float64(w) / float64(n), "draw": float64(d) / float64(n),
		"loss": float64(l) / float64(n), "goalsFor": float64(gf) / float64(n),
		"goalsAgainst": float64(ga) / float64(n), "factors": factors,
	}, nil
}

func (r *Repository) planFactors(ctx context.Context, plan, me, opp map[string]any, home bool, squad []any, theirStyle string) ([]any, error) {
	out := []any{}
	myPower := int(math.Round(numOf(me["Rating"]) * 2.5))
	oppPower := int(math.Round(numOf(opp["Rating"]) * 2.5))
	gap := myPower - oppPower
	tone := "neutral"
	if gap > 4 {
		tone = "good"
	} else if gap < -4 {
		tone = "bad"
	}
	out = append(out, map[string]any{"label": "Squad strength", "tone": tone, "detail": fmt.Sprintf("Power %d vs %d", myPower, oppPower)})
	if home {
		out = append(out, map[string]any{"label": "Home ground", "tone": "good", "detail": "Your crowd, your pitch"})
	}
	t, err := r.tiers(ctx, db.StringField(me, "_id"))
	if err != nil {
		return nil, err
	}
	scoutingTier := intOf(t["scoutingTier"])
	planStyle := db.StringField(plan, "style")
	if scoutingTier >= 1 {
		m := styleMatchup(planStyle, theirStyle)
		mt := "neutral"
		detail := fmt.Sprintf("%s vs %s: no edge either way", labelStyle(planStyle), labelStyle(theirStyle))
		if m > 0 {
			mt = "good"
			detail = fmt.Sprintf("%s counters their %s", labelStyle(planStyle), labelStyle(theirStyle))
		} else if m < 0 {
			mt = "bad"
			detail = fmt.Sprintf("Their %s counters your %s", labelStyle(theirStyle), labelStyle(planStyle))
		}
		out = append(out, map[string]any{"label": "Style matchup", "tone": mt, "detail": detail})
	} else {
		out = append(out, map[string]any{"label": "Style matchup", "tone": "neutral", "detail": "Unknown: build a Scouting Department to see how they play"})
	}
	effect := planEffect(plan, myPower, oppPower, squadMorale(squad), intOf(t["trainingTier"]))
	for _, n := range effect {
		out = append(out, n)
	}
	ht := mapOf(plan["halfTime"])
	if ht != nil && (ht["losing"] != nil || ht["drawing"] != nil || ht["winning"] != nil) {
		out = append(out, map[string]any{"label": "Half-time orders", "tone": "good", "detail": "The staff will change approach at the break"})
	}
	return out, nil
}

func squadMorale(squad []any) float64 {
	if len(squad) == 0 {
		return 60
	}
	sum := 0.0
	for _, p := range squad {
		sum += numOf(p.(map[string]any)["morale"])
	}
	return sum / float64(len(squad))
}

func planEffect(plan map[string]any, myPower, oppPower int, morale float64, trainingTier int) []any {
	notes := []any{}
	underdog := oppPower-myPower >= 5
	if db.StringField(plan, "training") == "recovery" {
		notes = append(notes, map[string]any{"label": "Recovery session", "tone": "good", "detail": "Starters +20 fitness"})
	} else if db.StringField(plan, "training") == "drills" {
		sharp := 0.6 + 0.35*float64(trainingTier)
		notes = append(notes, map[string]any{"label": "Tactical drills", "tone": "good", "detail": fmt.Sprintf("+%.1f sharpness (Training Ground tier %d), starters -10 fitness", sharp, trainingTier)})
	}
	switch db.StringField(plan, "teamTalk") {
	case "motivate":
		notes = append(notes, map[string]any{"label": "Team talk: motivate", "tone": "good", "detail": map[bool]string{true: "Fired up as underdogs", false: "A small lift"}[underdog]})
	case "demand":
		lands := !underdog && morale >= 58
		detail := "Morale too low: it backfires"
		if lands {
			detail = "A confident squad rises to it"
		} else if underdog {
			detail = "Too much pressure against a stronger side"
		}
		tone := "bad"
		if lands {
			tone = "good"
		}
		notes = append(notes, map[string]any{"label": "Team talk: demand a win", "tone": tone, "detail": detail})
	}
	return notes
}

// BookMatch is POST /api/play/{clubId}/book.
func (r *Repository) BookMatch(ctx context.Context, clubID, opponentID string) (map[string]any, error) {
	if clubID == opponentID {
		return nil, prepErr("You can't book a match against yourself")
	}
	me, mok, err := r.one(ctx, `SELECT * FROM "Clubs" WHERE "_id" = $1`, clubID)
	if err != nil {
		return nil, err
	}
	opp, ook, err := r.one(ctx, `SELECT * FROM "Clubs" WHERE "_id" = $1`, opponentID)
	if err != nil {
		return nil, err
	}
	if !mok || !ook || opp["ReleasedAt"] != nil {
		return nil, PrepError{"That club is not available", 404}
	}
	if db.StringField(me, "UserId") != "" && db.StringField(opp, "UserId") == db.StringField(me, "UserId") {
		return nil, prepErr("Book a match against another manager or an AI club")
	}
	pending, _, err := r.one(ctx, `SELECT count(*)::int AS n FROM "Fixtures" WHERE "HomeTeamId" = $1 AND "Stage" = $2 AND "Played" = false`, clubID, bookedStage)
	if err != nil {
		return nil, err
	}
	if pending != nil && intOf(pending["n"]) >= maxBookings {
		return nil, prepErr(fmt.Sprintf("You already have %d matches booked - play those first", maxBookings))
	}
	w, err := r.world(ctx)
	if err != nil {
		return nil, err
	}
	busy := func(day int) (bool, error) {
		n, _, err := r.one(ctx, `SELECT count(*)::int AS n FROM "Fixtures" WHERE "ScheduledDay" = $1 AND ("HomeTeamId" = ANY($2) OR "AwayTeamId" = ANY($2))`, day, []string{clubID, opponentID})
		if err != nil {
			return false, err
		}
		return n != nil && intOf(n["n"]) > 0, nil
	}
	day, ok := nextCupDay(w, intOf(w["CurrentDay"])+1)
	for tries := 0; ok && tries < 6; tries++ {
		b, err := busy(day)
		if err != nil {
			return nil, err
		}
		if !b {
			break
		}
		day, ok = nextCupDay(w, day+1)
	}
	if !ok {
		return nil, prepErr("No free match day in the next few weeks")
	}
	fixture, err := db.InsertRow(ctx, r.q, "Fixtures", map[string]any{
		"Title": fmt.Sprintf("%s vs %s (Booked)", db.StringField(me, "Name"), db.StringField(opp, "Name")),
		"Home":  db.StringField(me, "ClubCode"), "Away": db.StringField(opp, "ClubCode"),
		"HomeTeamId": clubID, "AwayTeamId": opponentID,
		"Type": "friendly", "Stage": bookedStage, "ChallengeStatus": "accepted",
		"ChallengerClubId": clubID, "ProposedAt": time.Now(), "Played": false, "SaveStats": true,
		"ScheduledDay": day, "KickoffHour": w["CupKickoffHour"], "updatedAt": time.Now(),
	})
	if err != nil {
		return nil, err
	}
	if db.StringField(opp, "UserId") != "" {
		_, _ = db.InsertRow(ctx, r.q, "ClubMessages", map[string]any{
			"ClubId": opponentID, "Kind": "squad", "Tone": "neutral",
			"Title":     fmt.Sprintf("%s booked a match at their ground", db.StringField(me, "Name")),
			"Body":      fmt.Sprintf("Day %d, %02d:00. Set your match plan before kick-off, or your saved team sheet plays.", day, intOf(w["CupKickoffHour"])),
			"updatedAt": time.Now(),
		})
	}
	return r.toMatchdayFixture(ctx, fixture, clubID, w)
}

// buildSimRequestWithTactics builds the engine request with explicit tactics.
func (r *Repository) buildSimRequestWithTactics(ctx context.Context, fixtureID, homeID, awayID string, home, away map[string]any, homeTactic, awayTactic map[string]any, frames bool) (map[string]any, error) {
	hp, err := r.clubPlayers(ctx, homeID)
	if err != nil {
		return nil, err
	}
	ap, err := r.clubPlayers(ctx, awayID)
	if err != nil {
		return nil, err
	}
	// A stored grid overrides the formation anchors with freeform `slots`. The
	// maps are copied, never mutated, so a caller reusing `opp["Tactic"]` is safe.
	layoutRepo := r.layoutRepo()
	homeTactic = withStoredLayout(ctx, layoutRepo, homeID, grid.Match, homeTactic)
	awayTactic = withStoredLayout(ctx, layoutRepo, awayID, grid.Match, awayTactic)
	clubJSON := func(c map[string]any, players []any, tactic map[string]any) map[string]any {
		return map[string]any{
			"_id": db.StringField(c, "_id"), "Name": db.StringField(c, "Name"),
			"ClubCode": db.StringField(c, "ClubCode"), "ManagerId": nullableString2(db.StringField(c, "ManagerId")),
			"Tactic": tacticOr(tactic, c), "Players": players, "Lineup": c["Lineup"],
		}
	}
	return map[string]any{
		"fixtureId": fixtureID, "seed": randUUID(),
		"sides":         map[string]any{"home": homeID, "away": awayID},
		"clubs":         []any{clubJSON(home, hp, homeTactic), clubJSON(away, ap, awayTactic)},
		"tactics":       map[string]any{"home": homeTactic, "away": awayTactic},
		"includeFrames": frames,
	}, nil
}

func tacticOr(t, club map[string]any) map[string]any {
	if t != nil {
		return t
	}
	return tacticOf(club)
}
