package openplay

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
)

// Challenge lifecycle + scheduler, ported from
// apps/fs-pro-server/src/services/competitions/challenge.service.ts,
// ai-competitions.service.ts (applyChallengePolicy) and ranking.service.ts
// (applyResult).

// LeagueRules is the full open-play rule set (definition.ts DEFAULT_LEAGUE_RULES
// plus the world/stage overrides).
type LeagueRules struct {
	Metric                   string
	Tiebreakers              []string
	PointsForWin             int
	PointsForDraw            int
	MinGamesToRank           int
	MaxGames                 *int
	MaxVsSameOpponent        int
	RematchCooldownDays      int
	ChallengeRange           int
	RespondWithinDays        int
	MaxOpenChallenges        int
	MinDeclinesBeforeForfeit int
}

func intPtr(n int) *int { return &n }

func defaultLeagueRules() LeagueRules {
	return LeagueRules{
		Metric: "ppg", Tiebreakers: []string{"gd", "gf", "wins"},
		PointsForWin: 3, PointsForDraw: 1, MinGamesToRank: 10,
		MaxGames: intPtr(40), MaxVsSameOpponent: 2, RematchCooldownDays: 14,
		ChallengeRange: 5, RespondWithinDays: 3, MaxOpenChallenges: 3,
		MinDeclinesBeforeForfeit: 3,
	}
}

func applyRuleOverrides(rules *LeagueRules, src map[string]any) {
	if src == nil {
		return
	}
	if v := db.StringField(src, "metric"); v != "" {
		rules.Metric = v
	}
	if tb := stringSliceOf(src["tiebreakers"]); len(tb) > 0 {
		rules.Tiebreakers = tb
	}
	for key, dst := range map[string]*int{
		"pointsForWin": &rules.PointsForWin, "pointsForDraw": &rules.PointsForDraw,
		"minGamesToRank": &rules.MinGamesToRank, "maxVsSameOpponent": &rules.MaxVsSameOpponent,
		"rematchCooldownDays": &rules.RematchCooldownDays, "challengeRange": &rules.ChallengeRange,
		"respondWithinDays": &rules.RespondWithinDays, "maxOpenChallenges": &rules.MaxOpenChallenges,
		"minDeclinesBeforeForfeit": &rules.MinDeclinesBeforeForfeit,
	} {
		if v, ok := src[key]; ok && v != nil {
			*dst = intVal(v)
		}
	}
	if v, ok := src["maxGames"]; ok {
		if v == nil {
			rules.MaxGames = nil
		} else {
			rules.MaxGames = intPtr(intVal(v))
		}
	}
}

// resolveFullRules merges code defaults, the world's DefaultRules, then the
// stage's own rules (definition.ts resolveLeagueRules).
func resolveFullRules(stage map[string]any, worldDefaults map[string]any) LeagueRules {
	rules := defaultLeagueRules()
	applyRuleOverrides(&rules, worldDefaults)
	if stage != nil {
		applyRuleOverrides(&rules, mapOf(stage["rules"]))
	}
	return rules
}

// --- errors ----------------------------------------------------------------

type challengeError struct {
	code    string
	message string
	reasons []string
}

func (e challengeError) Error() string { return e.message }

func newChallengeErr(code, message string) challengeError {
	return challengeError{code: code, message: message, reasons: []string{message}}
}

func (e challengeError) withReasons(reasons []string) challengeError {
	e.reasons = reasons
	return e
}

func challengeFail(err error) httpapi.Response {
	var ce challengeError
	if errors.As(err, &ce) {
		status := 400
		switch ce.code {
		case "not-found":
			status = 404
		case "not-allowed":
			status = 403
		case "wrong-status", "no-slot", "ineligible":
			status = 409
		}
		return httpapi.Fail(status, ce.message, ce.reasons)
	}
	return editionFail(err)
}

// --- stage context ---------------------------------------------------------

type chCtx struct {
	season     map[string]any
	stageIndex int
	rules      LeagueRules
	lastDay    int
	today      int
}

// openStage returns the running league/groups stage, or nil (challenge.service).
func openStage(season map[string]any, worldDefaults map[string]any, today int) *chCtx {
	def := mapOf(season["Definition"])
	stages := toMapList(def["Stages"])
	idx := intVal(season["CurrentStage"])
	if db.StringField(season, "Status") != "running" || idx < 0 || idx >= len(stages) {
		return nil
	}
	stage := stages[idx]
	t := db.StringField(stage, "type")
	if t == "knockout" || t == "pyramid" {
		return nil
	}
	lastDay := intVal(season["StageStartedDay"]) + intVal(stage["days"]) - 1
	if today > lastDay {
		return nil
	}
	return &chCtx{season: season, stageIndex: idx, rules: resolveFullRules(stage, worldDefaults), lastDay: lastDay, today: today}
}

func contextAt(ctx context.Context, q db.Querier, seasonID string) (*chCtx, error) {
	season, err := seasonRow(ctx, q, seasonID)
	if err != nil {
		return nil, err
	}
	cal, err := calendarAt(ctx, q)
	if err != nil {
		return nil, err
	}
	open := openStage(season, mapOf(cal["DefaultRules"]), intVal(cal["CurrentDay"]))
	if open == nil {
		return nil, newChallengeErr("wrong-status", "No league or group stage is open for challenges")
	}
	return open, nil
}

// --- scheduler -------------------------------------------------------------

// findSlot ports challenge.service.findSlot: the first cup day in
// [fromDay, lastDay] on which none of clubIds already has a live fixture.
func (r *Repository) findSlot(ctx context.Context, q db.Querier, clubIDs []string, fromDay, lastDay int) (int, bool, error) {
	if fromDay > lastDay {
		return 0, false, nil
	}
	cal, err := calendarAt(ctx, q)
	if err != nil {
		return 0, false, err
	}
	rows, err := q.Query(ctx, `SELECT DISTINCT "ScheduledDay" FROM "Fixtures"
		WHERE ("HomeTeamId" = ANY($1) OR "AwayTeamId" = ANY($1))
		  AND "ScheduledDay" >= $2 AND "ScheduledDay" <= $3
		  AND ("ChallengeStatus" IS NULL OR "ChallengeStatus" = ANY($4))`,
		clubIDs, fromDay, lastDay, []string{"accepted", "played"})
	if err != nil {
		return 0, false, err
	}
	busyRows, err := db.ScanAll(rows)
	if err != nil {
		return 0, false, err
	}
	taken := map[int]bool{}
	for _, b := range busyRows {
		taken[intVal(b["ScheduledDay"])] = true
	}
	for day := fromDay; day <= lastDay; day++ {
		if dayKind(cal, day) == "C" && !taken[day] {
			return day, true, nil
		}
	}
	return 0, false, nil
}

// lockClubs locks the clubs in id order so two actions can't interleave.
func lockClubs(ctx context.Context, q db.Querier, clubIDs []string) (map[string]map[string]any, error) {
	rows, err := q.Query(ctx, `SELECT "_id", "Name", "ClubCode" FROM "Clubs" WHERE "_id" = ANY($1) ORDER BY "_id" FOR UPDATE`, clubIDs)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := map[string]map[string]any{}
	for _, c := range list {
		out[db.StringField(c, "_id")] = c
	}
	return out, nil
}

// stageRanksAt returns club -> rank (nil when unranked) for a stage.
func (r *Repository) stageRanksAt(ctx context.Context, seasonID string, stageIndex int, rules LeagueRules) (map[string]any, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Rankings" WHERE "SeasonId" = $1 AND "StageIndex" = $2`, seasonID, stageIndex)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	byGroup := map[string][]map[string]any{}
	for _, row := range list {
		g := db.StringField(row, "Group")
		byGroup[g] = append(byGroup[g], row)
	}
	rankRule := leagueRules{metric: rules.Metric, tiebreakers: rules.Tiebreakers, minGamesToRank: rules.MinGamesToRank}
	out := map[string]any{}
	for g, group := range byGroup {
		_ = g
		for _, rr := range rankRankingRows(group, rankRule) {
			out[db.StringField(rr, "clubId")] = rr["rank"]
		}
	}
	return out, nil
}

// --- proposal rules --------------------------------------------------------

func (r *Repository) proposalReasons(ctx context.Context, q db.Querier, c *chCtx, challengerID, opponentID string, ranks map[string]any) ([]string, error) {
	reasons := []string{}
	if challengerID == opponentID {
		return []string{"A club can't challenge itself"}, nil
	}
	rows, err := q.Query(ctx, `SELECT * FROM "Entries" WHERE "SeasonId" = $1 AND "ClubId" = ANY($2)`, db.StringField(c.season, "_id"), []string{challengerID, opponentID})
	if err != nil {
		return nil, err
	}
	pair, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	var me, them map[string]any
	for _, e := range pair {
		if db.StringField(e, "ClubId") == challengerID {
			me = e
		}
		if db.StringField(e, "ClubId") == opponentID {
			them = e
		}
	}
	if me == nil || db.StringField(me, "Status") != "active" {
		return []string{"You are not playing in this stage"}, nil
	}
	if them == nil || db.StringField(them, "Status") != "active" {
		return []string{"They are not playing in this stage"}, nil
	}
	if db.StringField(me, "Group") != db.StringField(them, "Group") {
		return []string{"Not in your group"}, nil
	}

	fixtureRows, err := q.Query(ctx, `SELECT * FROM "Fixtures"
		WHERE "SeasonId" = $1 AND "StageIndex" = $2
		  AND ("HomeTeamId" = ANY($3) OR "AwayTeamId" = ANY($3))
		  AND "ChallengeStatus" = ANY($4)`,
		db.StringField(c.season, "_id"), c.stageIndex, []string{challengerID, opponentID},
		[]string{"proposed", "accepted", "played", "forfeited"})
	if err != nil {
		return nil, err
	}
	stageFixtures, err := db.ScanAll(fixtureRows)
	if err != nil {
		return nil, err
	}
	involves := func(f map[string]any, id string) bool {
		return db.StringField(f, "HomeTeamId") == id || db.StringField(f, "AwayTeamId") == id
	}
	committed := func(f map[string]any) bool {
		s := db.StringField(f, "ChallengeStatus")
		return s == "accepted" || s == "played" || s == "forfeited"
	}

	if c.rules.MaxGames != nil {
		count := 0
		for _, f := range stageFixtures {
			if committed(f) && involves(f, challengerID) {
				count++
			}
		}
		if count >= *c.rules.MaxGames {
			reasons = append(reasons, fmt.Sprintf("You have reached %d games", *c.rules.MaxGames))
		}
		count = 0
		for _, f := range stageFixtures {
			if committed(f) && involves(f, opponentID) {
				count++
			}
		}
		if count >= *c.rules.MaxGames {
			reasons = append(reasons, fmt.Sprintf("They have reached %d games", *c.rules.MaxGames))
		}
	}

	between := []map[string]any{}
	met := 0
	lastMeeting := -1 << 30
	for _, f := range stageFixtures {
		if involves(f, challengerID) && involves(f, opponentID) {
			between = append(between, f)
			if committed(f) {
				met++
				if d := intVal(f["ScheduledDay"]); d > lastMeeting {
					lastMeeting = d
				}
			}
		}
	}
	if met >= c.rules.MaxVsSameOpponent {
		plural := "times"
		if met == 1 {
			plural = "time"
		}
		reasons = append(reasons, fmt.Sprintf("Already played %d %s", met, plural))
	}
	if lastMeeting != -1<<30 && c.today-lastMeeting < c.rules.RematchCooldownDays {
		reasons = append(reasons, fmt.Sprintf("Cooldown: %d days", c.rules.RematchCooldownDays-(c.today-lastMeeting)))
	}
	for _, f := range between {
		s := db.StringField(f, "ChallengeStatus")
		if s == "proposed" || (s == "accepted" && !boolVal(f["Played"])) {
			reasons = append(reasons, "A challenge between you is already pending")
			break
		}
	}
	open, err := countAt(ctx, q, `SELECT count(*)::int AS n FROM "Fixtures" WHERE "SeasonId" = $1 AND "ChallengerClubId" = $2 AND "ChallengeStatus" = 'proposed'`, db.StringField(c.season, "_id"), challengerID)
	if err != nil {
		return nil, err
	}
	if open >= c.rules.MaxOpenChallenges {
		reasons = append(reasons, fmt.Sprintf("You already have %d open challenges", open))
	}
	if c.rules.ChallengeRange > 0 {
		rk := ranks
		if rk == nil {
			rk, err = r.stageRanksAt(ctx, db.StringField(c.season, "_id"), c.stageIndex, c.rules)
			if err != nil {
				return nil, err
			}
		}
		a, aOK := rk[challengerID]
		b, bOK := rk[opponentID]
		if aOK && bOK && a != nil && b != nil {
			diff := intVal(a) - intVal(b)
			if diff < 0 {
				diff = -diff
			}
			if diff > c.rules.ChallengeRange {
				reasons = append(reasons, fmt.Sprintf("Outside range (%d places)", c.rules.ChallengeRange))
			}
		}
	}
	return reasons, nil
}

// EligibleOpponents ports ChallengeService.eligibleOpponents: everyone the club
// could face in its current stage, with reasons for those it can't challenge.
func (r *Repository) EligibleOpponents(ctx context.Context, seasonID, clubID string) ([]any, error) {
	c, err := contextAt(ctx, r.q, seasonID)
	if err != nil {
		return nil, err
	}
	mine, err := oneAt(ctx, r.q, `SELECT * FROM "Entries" WHERE "SeasonId" = $1 AND "ClubId" = $2 LIMIT 1`, seasonID, clubID)
	if err != nil {
		return nil, err
	}
	if mine == nil || db.StringField(mine, "Status") != "active" {
		return nil, newChallengeErr("not-allowed", "You are not playing in this stage")
	}
	rows, err := r.q.Query(ctx, `SELECT c."_id" AS clubId, c."Name" AS name, c."ClubCode" AS clubCode, c."Elo" AS elo, e."Group" AS grp
		FROM "Entries" e JOIN "Clubs" c ON c."_id" = e."ClubId"
		WHERE e."SeasonId" = $1 AND e."Status" = 'active' AND e."ClubId" <> $2`, seasonID, clubID)
	if err != nil {
		return nil, err
	}
	others, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	ranks, err := r.stageRanksAt(ctx, seasonID, c.stageIndex, c.rules)
	if err != nil {
		return nil, err
	}
	myGroup := db.StringField(mine, "Group")

	type option struct {
		payload  map[string]any
		rank     int
		eligible bool
		elo      float64
	}
	list := []option{}
	for _, o := range others {
		if db.StringField(o, "grp") != myGroup {
			continue
		}
		reasons, err := r.proposalReasons(ctx, r.q, c, clubID, db.StringField(o, "clubId"), ranks)
		if err != nil {
			return nil, err
		}
		rank := ranks[db.StringField(o, "clubId")]
		rankInt := 1 << 30
		if rank != nil {
			rankInt = intVal(rank)
		}
		elo := numVal(o["elo"])
		list = append(list, option{
			payload: map[string]any{
				"clubId": db.StringField(o, "clubId"), "name": db.StringField(o, "name"),
				"clubCode": db.StringField(o, "clubCode"), "rank": rank, "elo": elo,
				"eligible": len(reasons) == 0, "reasons": reasons,
			},
			rank: rankInt, eligible: len(reasons) == 0, elo: elo,
		})
	}
	sort.SliceStable(list, func(i, j int) bool {
		if list[i].eligible != list[j].eligible {
			return list[i].eligible
		}
		if list[i].rank != list[j].rank {
			return list[i].rank < list[j].rank
		}
		return list[i].elo > list[j].elo
	})
	out := make([]any, 0, len(list))
	for _, o := range list {
		out = append(out, o.payload)
	}
	return out, nil
}

// --- lifecycle -------------------------------------------------------------

func loadChallenge(ctx context.Context, q db.Querier, fixtureID string) (map[string]any, error) {
	rows, err := q.Query(ctx, `SELECT * FROM "Fixtures" WHERE "_id" = $1 LIMIT 1`, fixtureID)
	if err != nil {
		return nil, err
	}
	f, ok, err := db.ScanOne(rows)
	if err != nil {
		return nil, err
	}
	if !ok || db.StringField(f, "ChallengeStatus") == "" || db.StringField(f, "SeasonId") == "" {
		return nil, newChallengeErr("not-found", "Challenge not found")
	}
	return f, nil
}

// Propose ports ChallengeService.propose. applyChallengePolicy is applied by
// the caller, exactly as the router does.
func (r *Repository) Propose(ctx context.Context, seasonID, challengerID, opponentID string) (map[string]any, error) {
	var created map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		locked, err := lockClubs(ctx, tx, []string{challengerID, opponentID})
		if err != nil {
			return err
		}
		c, err := contextAt(ctx, tx, seasonID)
		if err != nil {
			return err
		}
		reasons, err := r.proposalReasons(ctx, tx, c, challengerID, opponentID, nil)
		if err != nil {
			return err
		}
		if len(reasons) > 0 {
			return newChallengeErr("ineligible", joinReasons(reasons)).withReasons(reasons)
		}
		home := locked[opponentID]
		away := locked[challengerID]
		if home == nil || away == nil {
			return errors.New("club not found")
		}
		leagueCode := db.StringField(c.season, "CompetitionCode")
		if cid := db.StringField(c.season, "CompetitionId"); cid != "" {
			if comp, err := oneAt(ctx, tx, `SELECT "CompetitionCode","Name" FROM "Competitions" WHERE "_id" = $1 LIMIT 1`, cid); err == nil && comp != nil {
				if code := db.StringField(comp, "CompetitionCode"); code != "" {
					leagueCode = code
				}
			}
		}
		respondBy := c.today + c.rules.RespondWithinDays
		if c.lastDay < respondBy {
			respondBy = c.lastDay
		}
		row, err := db.InsertRow(ctx, tx, "Fixtures", map[string]any{
			"Title":            db.StringField(home, "Name") + " vs " + db.StringField(away, "Name"),
			"SeasonId":         seasonID,
			"SeasonCode":       db.StringField(c.season, "SeasonCode"),
			"LeagueCode":       leagueCode,
			"CompetitionId":    nilIfEmpty(db.StringField(c.season, "CompetitionId")),
			"StageIndex":       c.stageIndex,
			"Stage":            "open-match",
			"Type":             "league",
			"Home":             db.StringField(home, "ClubCode"),
			"Away":             db.StringField(away, "ClubCode"),
			"HomeTeamId":       opponentID,
			"AwayTeamId":       challengerID,
			"ChallengeStatus":  "proposed",
			"ChallengerClubId": challengerID,
			"ProposedAt":       time.Now(),
			"RespondBy":        respondBy,
			"updatedAt":        time.Now(),
		})
		if err != nil {
			return err
		}
		created = row
		return nil
	})
	if err != nil {
		return nil, err
	}
	return created, nil
}

// Accept ports ChallengeService.accept: the challenged club puts the match on
// the first free cup day before the stage ends.
func (r *Repository) Accept(ctx context.Context, fixtureID, byClubID string) (map[string]any, error) {
	var updated map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		peek, err := loadChallenge(ctx, tx, fixtureID)
		if err != nil {
			return err
		}
		if _, err := lockClubs(ctx, tx, []string{db.StringField(peek, "HomeTeamId"), db.StringField(peek, "AwayTeamId")}); err != nil {
			return err
		}
		fixture, err := loadChallenge(ctx, tx, fixtureID)
		if err != nil {
			return err
		}
		if db.StringField(fixture, "HomeTeamId") != byClubID {
			return newChallengeErr("not-allowed", "Only the challenged club can accept")
		}
		if db.StringField(fixture, "ChallengeStatus") != "proposed" {
			return newChallengeErr("wrong-status", "Challenge is "+db.StringField(fixture, "ChallengeStatus"))
		}
		c, err := contextAt(ctx, tx, db.StringField(fixture, "SeasonId"))
		if err != nil {
			return err
		}
		if intVal(fixture["StageIndex"]) != c.stageIndex {
			return newChallengeErr("wrong-status", "That stage is over")
		}
		if fixture["RespondBy"] != nil && c.today > intVal(fixture["RespondBy"]) {
			return newChallengeErr("wrong-status", "Too late to accept")
		}
		day, ok, err := r.findSlot(ctx, tx, []string{db.StringField(fixture, "HomeTeamId"), db.StringField(fixture, "AwayTeamId")}, c.today+1, c.lastDay)
		if err != nil {
			return err
		}
		if !ok {
			return newChallengeErr("no-slot", "No free day for both clubs before this stage ends")
		}
		cal, err := calendarAt(ctx, tx)
		if err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `UPDATE "Fixtures" SET "ChallengeStatus"='accepted', "ScheduledDay"=$2, "ScheduledDate"=$3, "updatedAt"=now() WHERE "_id"=$1 RETURNING *`,
			fixtureID, day, dateOfDay(cal, day))
		if err != nil {
			return err
		}
		row, _, err := db.ScanOne(rows)
		if err != nil {
			return err
		}
		updated = row
		return nil
	})
	if err != nil {
		return nil, err
	}
	return updated, nil
}

// dateOfDay converts a game day to the calendar date it falls on.
func dateOfDay(cal map[string]any, day int) time.Time {
	base := time.Now()
	if s := db.StringField(cal, "CurrentDate"); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			base = t
		} else if t, err := time.Parse("2006-01-02T15:04:05.000Z", s); err == nil {
			base = t
		}
	}
	return base.Add(time.Duration(day-intVal(cal["CurrentDay"])) * 24 * time.Hour)
}

// declineCount counts a club's declined/expired/forfeited challenges.
func declineCount(ctx context.Context, q db.Querier, seasonID, clubID string) (int, error) {
	return countAt(ctx, q, `SELECT count(*)::int AS n FROM "Fixtures" WHERE "SeasonId"=$1 AND "HomeTeamId"=$2 AND "ChallengeStatus" = ANY($3)`,
		seasonID, clubID, []string{"declined", "expired", "forfeited"})
}

// refuse marks a proposed challenge declined or forfeited.
func refuse(ctx context.Context, q db.Querier, fixture map[string]any, as string) (bool, error) {
	season, err := seasonRow(ctx, q, db.StringField(fixture, "SeasonId"))
	if err != nil {
		return false, err
	}
	cal, err := calendarAt(ctx, q)
	if err != nil {
		return false, err
	}
	var rules *LeagueRules
	stages := toMapList(mapOf(season["Definition"])["Stages"])
	idx := intVal(fixture["StageIndex"])
	if idx >= 0 && idx < len(stages) && db.StringField(stages[idx], "type") != "knockout" {
		r := resolveFullRules(stages[idx], mapOf(cal["DefaultRules"]))
		rules = &r
	}
	before, err := declineCount(ctx, q, db.StringField(fixture, "SeasonId"), db.StringField(fixture, "HomeTeamId"))
	if err != nil {
		return false, err
	}
	forfeit := rules != nil && before >= rules.MinDeclinesBeforeForfeit
	status := as
	var scheduledDay any
	var playedAt any
	if forfeit {
		status = "forfeited"
		scheduledDay = intVal(cal["CurrentDay"])
		playedAt = time.Now()
	}
	if _, err := q.Exec(ctx, `UPDATE "Fixtures" SET "ChallengeStatus"=$2, "ScheduledDay"=$3, "Played"=$4, "PlayedAt"=$5, "updatedAt"=now() WHERE "_id"=$1`,
		db.StringField(fixture, "_id"), status, scheduledDay, forfeit, playedAt); err != nil {
		return false, err
	}
	return forfeit, nil
}

// Decline ports ChallengeService.decline (+ forfeit applyResult).
func (r *Repository) Decline(ctx context.Context, fixtureID, byClubID string) (bool, error) {
	var forfeit bool
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		peek, err := loadChallenge(ctx, tx, fixtureID)
		if err != nil {
			return err
		}
		if _, err := lockClubs(ctx, tx, []string{db.StringField(peek, "HomeTeamId"), db.StringField(peek, "AwayTeamId")}); err != nil {
			return err
		}
		fixture, err := loadChallenge(ctx, tx, fixtureID)
		if err != nil {
			return err
		}
		if db.StringField(fixture, "HomeTeamId") != byClubID {
			return newChallengeErr("not-allowed", "Only the challenged club can decline")
		}
		if db.StringField(fixture, "ChallengeStatus") != "proposed" {
			return newChallengeErr("wrong-status", "Challenge is "+db.StringField(fixture, "ChallengeStatus"))
		}
		forfeit, err = refuse(ctx, tx, fixture, "declined")
		if err != nil {
			return err
		}
		if forfeit {
			// D27: commit the forfeit status and its ranking/Elo/XP result in
			// ONE transaction. A failure here rolls the status back too, so the
			// challenge stays 'proposed' and the result is retryable.
			return applyResultTx(ctx, tx, fixtureID, db.StringField(fixture, "HomeTeamId"))
		}
		return nil
	})
	if err != nil {
		return false, err
	}
	return forfeit, nil
}

// Cancel ports ChallengeService.cancel.
func (r *Repository) Cancel(ctx context.Context, fixtureID, byClubID string) (map[string]any, error) {
	var updated map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		fixture, err := loadChallenge(ctx, tx, fixtureID)
		if err != nil {
			return err
		}
		if byClubID != "admin" && db.StringField(fixture, "ChallengerClubId") != byClubID {
			return newChallengeErr("not-allowed", "Only the challenger can cancel")
		}
		status := db.StringField(fixture, "ChallengeStatus")
		allowed := status == "proposed"
		if byClubID == "admin" {
			allowed = status == "proposed" || status == "accepted"
		}
		if !allowed || boolVal(fixture["Played"]) {
			return newChallengeErr("wrong-status", "Challenge is "+status)
		}
		rows, err := tx.Query(ctx, `UPDATE "Fixtures" SET "ChallengeStatus"='cancelled', "ScheduledDay"=NULL, "ScheduledDate"=NULL, "updatedAt"=now() WHERE "_id"=$1 RETURNING *`, fixtureID)
		if err != nil {
			return err
		}
		row, _, err := db.ScanOne(rows)
		if err != nil {
			return err
		}
		updated = row
		return nil
	})
	if err != nil {
		return nil, err
	}
	return updated, nil
}

// --- auto-answer policy ----------------------------------------------------

type challengePolicy struct {
	AutoAccept           bool
	DeclineOutsidePolicy bool
	CompetitionIDs       []string
	MaxEloGap            *float64
	MinSquadFitness      *float64
	MaxPerWeek           *int
}

// SquadFitness is the average Fitness of a club's active players (100 when empty).
func (r *Repository) SquadFitness(ctx context.Context, clubID string) (float64, error) {
	rows, err := r.q.Query(ctx, `SELECT avg("Fitness") AS v FROM "Players" WHERE "ClubId" = $1 AND "isRetired" = false`, clubID)
	if err != nil {
		return 0, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok || m["v"] == nil {
		return 100, err
	}
	return numVal(m["v"]), nil
}

// ApplyChallengePolicy ports applyChallengePolicy: answer a challenge the
// moment it arrives if the home club is human and has an auto-accept policy.
func (r *Repository) ApplyChallengePolicy(ctx context.Context, fixtureID string) (string, error) {
	fixture, err := loadChallenge(ctx, r.q, fixtureID)
	if err != nil || db.StringField(fixture, "ChallengeStatus") != "proposed" {
		return "left", nil
	}
	me, err := oneAt(ctx, r.q, `SELECT * FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, db.StringField(fixture, "HomeTeamId"))
	if err != nil {
		return "", err
	}
	if me == nil || db.StringField(me, "UserId") == "" {
		return "left", nil
	}
	raw := mapOf(me["ChallengePolicy"])
	if raw == nil || !boolVal(raw["autoAccept"]) {
		return "left", nil
	}
	policy := challengePolicy{
		AutoAccept:           boolVal(raw["autoAccept"]),
		DeclineOutsidePolicy: boolVal(raw["declineOutsidePolicy"]),
		CompetitionIDs:       stringSliceOf(raw["competitionIds"]),
	}
	if raw["maxEloGap"] != nil {
		v := numVal(raw["maxEloGap"])
		policy.MaxEloGap = &v
	}
	if raw["minSquadFitness"] != nil {
		v := numVal(raw["minSquadFitness"])
		policy.MinSquadFitness = &v
	}
	if raw["maxPerWeek"] != nil {
		v := intVal(raw["maxPerWeek"])
		policy.MaxPerWeek = &v
	}
	opponent, err := oneAt(ctx, r.q, `SELECT * FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, db.StringField(fixture, "AwayTeamId"))
	if err != nil {
		return "", err
	}
	cal, err := calendarAt(ctx, r.q)
	if err != nil {
		return "", err
	}
	fits := true
	if len(policy.CompetitionIDs) > 0 && !containsString(policy.CompetitionIDs, db.StringField(fixture, "CompetitionId")) {
		fits = false
	}
	if fits && policy.MaxEloGap != nil {
		oppElo := numVal(me["Elo"])
		if opponent != nil {
			oppElo = numVal(opponent["Elo"])
		}
		gap := oppElo - numVal(me["Elo"])
		if gap < 0 {
			gap = -gap
		}
		if gap > *policy.MaxEloGap {
			fits = false
		}
	}
	if fits && policy.MinSquadFitness != nil {
		f, err := r.SquadFitness(ctx, db.StringField(me, "_id"))
		if err != nil {
			return "", err
		}
		if f < *policy.MinSquadFitness {
			fits = false
		}
	}
	if fits && policy.MaxPerWeek != nil {
		n, err := countAt(ctx, r.q, `SELECT count(*)::int AS n FROM "Fixtures" WHERE "HomeTeamId"=$1 AND "ChallengeStatus" = ANY($2) AND "RespondBy" >= $3`,
			db.StringField(me, "_id"), []string{"accepted", "played"}, intVal(cal["CurrentDay"])-7)
		if err != nil {
			return "", err
		}
		if n >= *policy.MaxPerWeek {
			fits = false
		}
	}
	if fits {
		if _, err := r.Accept(ctx, fixtureID, db.StringField(fixture, "HomeTeamId")); err != nil {
			return "left", nil
		}
		return "accepted", nil
	}
	if policy.DeclineOutsidePolicy {
		if _, err := r.Decline(ctx, fixtureID, db.StringField(fixture, "HomeTeamId")); err != nil {
			return "", err
		}
		return "declined", nil
	}
	return "left", nil
}

// --- applyResult -----------------------------------------------------------

// ApplyResult ports ranking.service.applyResult. Only the challenge forfeit
// path is wired today (forfeitedBy = the forfeiting club's id).
func (r *Repository) ApplyResult(ctx context.Context, fixtureID, forfeitedBy string) error {
	return db.WithTx(ctx, r.q, func(tx db.Querier) error {
		return applyResultTx(ctx, tx, fixtureID, forfeitedBy)
	})
}

// applyResultGuard is a test-only seam: when set it forces applyResultTx to
// fail, so a test can prove the caller rolls the whole result back (D27).
var applyResultGuard func() error

// applyResultTx is the body of applyResult, runnable inside a caller's
// transaction so a forfeit status and its ranking result commit or roll back
// together.
func applyResultTx(ctx context.Context, tx db.Querier, fixtureID, forfeitedBy string) error {
	if applyResultGuard != nil {
		if err := applyResultGuard(); err != nil {
			return err
		}
	}
	fixture, err := loadFixture(ctx, tx, fixtureID)
	if err != nil {
		return err
	}
	seasonID := db.StringField(fixture, "SeasonId")
	homeID := db.StringField(fixture, "HomeTeamId")
	awayID := db.StringField(fixture, "AwayTeamId")
	if db.StringField(fixture, "CompetitionId") == "" || seasonID == "" || homeID == "" || awayID == "" {
		return nil
	}
	if !boolVal(fixture["Played"]) && forfeitedBy == "" {
		return nil
	}
	tag, err := tx.Exec(ctx, `INSERT INTO "RankingResults" ("FixtureId","SeasonId") VALUES ($1,$2) ON CONFLICT ("FixtureId") DO NOTHING`, fixtureID, seasonID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return nil
	}
	if db.StringField(fixture, "ChallengeStatus") == "accepted" {
		if _, err := tx.Exec(ctx, `UPDATE "Fixtures" SET "ChallengeStatus"='played', "updatedAt"=now() WHERE "_id"=$1`, fixtureID); err != nil {
			return err
		}
	}

	homeGoals, awayGoals := 0, 0
	if forfeitedBy != "" {
		if forfeitedBy == homeID {
			homeGoals, awayGoals = 0, forfeitGoals
		} else {
			homeGoals, awayGoals = forfeitGoals, 0
		}
	} else {
		if v, _ := oneAt(ctx, tx, `SELECT "Goals" FROM "ClubMatchDetails" WHERE "_id" = $1 LIMIT 1`, db.StringField(fixture, "HomeSideDetailsId")); v != nil {
			homeGoals = intVal(v["Goals"])
		}
		if v, _ := oneAt(ctx, tx, `SELECT "Goals" FROM "ClubMatchDetails" WHERE "_id" = $1 LIMIT 1`, db.StringField(fixture, "AwaySideDetailsId")); v != nil {
			awayGoals = intVal(v["Goals"])
		}
	}

	season, err := seasonRow(ctx, tx, seasonID)
	if err != nil {
		return err
	}
	competition, _ := oneAt(ctx, tx, `SELECT * FROM "Competitions" WHERE "_id" = $1 LIMIT 1`, db.StringField(fixture, "CompetitionId"))
	cal, err := calendarAt(ctx, tx)
	if err != nil {
		return err
	}
	definition := definitionOf(season, competition)
	stageIndex := intVal(fixture["StageIndex"])
	rules := stageRulesFull(definition, stageIndex, mapOf(cal["DefaultRules"]))

	clubRows, err := tx.Query(ctx, `SELECT "_id","Elo","XP" FROM "Clubs" WHERE "_id" = ANY($1) ORDER BY "_id" FOR UPDATE`, []string{homeID, awayID})
	if err != nil {
		return err
	}
	clubList, err := db.ScanAll(clubRows)
	if err != nil {
		return err
	}
	clubByID := map[string]map[string]any{}
	for _, c := range clubList {
		clubByID[db.StringField(c, "_id")] = c
	}
	home := clubByID[homeID]
	away := clubByID[awayID]
	if home == nil || away == nil {
		return nil
	}

	day := intVal(fixture["ScheduledDay"])
	if fixture["ScheduledDay"] == nil {
		day = intVal(cal["CurrentDay"])
	}
	homeRow, homeRowID, err := ensureRowAt(ctx, tx, seasonID, stageIndex, homeID, numVal(home["Elo"]))
	if err != nil {
		return err
	}
	awayRow, awayRowID, err := ensureRowAt(ctx, tx, seasonID, stageIndex, awayID, numVal(away["Elo"]))
	if err != nil {
		return err
	}
	nextHome := applyMatchToRow(homeRow, homeGoals, awayGoals, rules, forfeitedBy == homeID)
	nextAway := applyMatchToRow(awayRow, awayGoals, homeGoals, rules, forfeitedBy == awayID)
	if err := updateRankingRow(ctx, tx, homeRowID, nextHome, day); err != nil {
		return err
	}
	if err := updateRankingRow(ctx, tx, awayRowID, nextAway, day); err != nil {
		return err
	}

	score := 0.5
	if homeGoals > awayGoals {
		score = 1
	} else if homeGoals < awayGoals {
		score = 0
	}
	newHomeElo, newAwayElo := eloAfter(numVal(home["Elo"]), numVal(away["Elo"]), score, defaultEloK)
	if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Elo"=$2, "updatedAt"=now() WHERE "_id"=$1`, homeID, newHomeElo); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Elo"=$2, "updatedAt"=now() WHERE "_id"=$1`, awayID, newAwayElo); err != nil {
		return err
	}

	xpPerMatch := defaultXPPerMatch()
	if rewards := mapOf(definition["Rewards"]); rewards != nil {
		if xp := mapOf(rewards["xpPerMatch"]); xp != nil {
			xpPerMatch = xp
		} else if xp := mapOf(cal["XPPerMatch"]); xp != nil {
			xpPerMatch = xp
		}
	} else if xp := mapOf(cal["XPPerMatch"]); xp != nil {
		xpPerMatch = xp
	}
	thresholds := toAnyList(cal["LevelThresholds"])
	if err := grantXpAt(ctx, tx, home, xpFor(xpPerMatch, homeGoals, awayGoals), day, seasonID, thresholds); err != nil {
		return err
	}
	if err := grantXpAt(ctx, tx, away, xpFor(xpPerMatch, awayGoals, homeGoals), day, seasonID, thresholds); err != nil {
		return err
	}
	_ = rules
	_ = nextHome
	_ = nextAway
	return nil
}

func defaultXPPerMatch() map[string]any {
	return map[string]any{"win": 30, "draw": 15, "loss": 5}
}

func xpFor(xpPerMatch map[string]any, goalsFor, goalsAgainst int) int {
	switch {
	case goalsFor > goalsAgainst:
		return intVal(xpPerMatch["win"])
	case goalsFor == goalsAgainst:
		return intVal(xpPerMatch["draw"])
	default:
		return intVal(xpPerMatch["loss"])
	}
}

func definitionOf(season, competition map[string]any) map[string]any {
	if def := mapOf(season["Definition"]); def != nil {
		return def
	}
	if competition == nil {
		return map[string]any{}
	}
	out := map[string]any{}
	for _, key := range []string{"Stages", "WinCondition", "Rewards"} {
		if v := competition[key]; v != nil {
			out[key] = v
		}
	}
	return out
}

func stageRulesFull(definition map[string]any, stageIndex int, worldDefaults map[string]any) LeagueRules {
	stages := toMapList(definition["Stages"])
	if stageIndex >= 0 && stageIndex < len(stages) && db.StringField(stages[stageIndex], "type") != "knockout" {
		return resolveFullRules(stages[stageIndex], worldDefaults)
	}
	return resolveFullRules(nil, worldDefaults)
}

func loadFixture(ctx context.Context, q db.Querier, fixtureID string) (map[string]any, error) {
	rows, err := q.Query(ctx, `SELECT * FROM "Fixtures" WHERE "_id" = $1 LIMIT 1`, fixtureID)
	if err != nil {
		return nil, err
	}
	f, ok, err := db.ScanOne(rows)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, newChallengeErr("not-found", "Challenge not found")
	}
	return f, nil
}

func rankingRowFromMap(m map[string]any) RankingRow {
	return RankingRow{
		ClubId: db.StringField(m, "ClubId"), Group: m["Group"],
		Played: intVal(m["Played"]), Wins: intVal(m["Wins"]), Draws: intVal(m["Draws"]),
		Losses: intVal(m["Losses"]), GF: intVal(m["GF"]), GA: intVal(m["GA"]), GD: intVal(m["GD"]),
		Points: intVal(m["Points"]), CleanSheets: intVal(m["CleanSheets"]), Forfeits: intVal(m["Forfeits"]),
		UnbeatenRun: intVal(m["UnbeatenRun"]), BestUnbeatenRun: intVal(m["BestUnbeatenRun"]),
		EloStart: numVal(m["EloStart"]),
	}
}

func ensureRowAt(ctx context.Context, q db.Querier, seasonID string, stageIndex int, clubID string, elo float64) (RankingRow, string, error) {
	rows, err := q.Query(ctx, `SELECT * FROM "Rankings" WHERE "SeasonId"=$1 AND "StageIndex"=$2 AND "ClubId"=$3 LIMIT 1`, seasonID, stageIndex, clubID)
	if err != nil {
		return RankingRow{}, "", err
	}
	existing, ok, err := db.ScanOne(rows)
	if err != nil {
		return RankingRow{}, "", err
	}
	if ok {
		return rankingRowFromMap(existing), db.StringField(existing, "_id"), nil
	}
	var group any
	if entry, _ := oneAt(ctx, q, `SELECT "Group" FROM "Entries" WHERE "SeasonId"=$1 AND "ClubId"=$2 LIMIT 1`, seasonID, clubID); entry != nil {
		group = entry["Group"]
	}
	created, err := db.InsertRow(ctx, q, "Rankings", map[string]any{
		"SeasonId": seasonID, "StageIndex": stageIndex, "ClubId": clubID, "Group": group,
		"EloStart": elo, "updatedAt": time.Now(),
	})
	if err != nil {
		return RankingRow{}, "", err
	}
	return rankingRowFromMap(created), db.StringField(created, "_id"), nil
}

func updateRankingRow(ctx context.Context, q db.Querier, id string, row RankingRow, day int) error {
	_, err := q.Exec(ctx, `UPDATE "Rankings" SET "Played"=$2,"Wins"=$3,"Draws"=$4,"Losses"=$5,"GF"=$6,"GA"=$7,
		"GD"=$8,"Points"=$9,"CleanSheets"=$10,"Forfeits"=$11,"UnbeatenRun"=$12,"BestUnbeatenRun"=$13,
		"LastPlayedDay"=$14,"updatedAt"=now() WHERE "_id"=$1`,
		id, row.Played, row.Wins, row.Draws, row.Losses, row.GF, row.GA, row.GD, row.Points,
		row.CleanSheets, row.Forfeits, row.UnbeatenRun, row.BestUnbeatenRun, day)
	return err
}

func grantXpAt(ctx context.Context, q db.Querier, club map[string]any, amount, day int, seasonID string, thresholds []any) error {
	if amount <= 0 {
		return nil
	}
	before := intVal(club["XP"])
	after := before + amount
	if _, err := q.Exec(ctx, `UPDATE "Clubs" SET "XP"=$2, "updatedAt"=now() WHERE "_id"=$1`, db.StringField(club, "_id"), after); err != nil {
		return err
	}
	fromLevel := levelForXp(before, thresholds)
	toLevel := levelForXp(after, thresholds)
	if toLevel != fromLevel {
		if _, err := db.InsertRow(ctx, q, "LevelHistory", map[string]any{
			"ClubId": db.StringField(club, "_id"), "Day": day, "FromLevel": fromLevel, "ToLevel": toLevel,
			"XPBefore": before, "XPAfter": after, "Source": "xp", "SeasonId": seasonID,
		}); err != nil {
			return err
		}
	}
	return nil
}

// --- helpers ---------------------------------------------------------------

func oneAt(ctx context.Context, q db.Querier, sql string, args ...any) (map[string]any, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return nil, err
	}
	return m, nil
}

func joinReasons(reasons []string) string {
	out := ""
	for i, r := range reasons {
		if i > 0 {
			out += "; "
		}
		out += r
	}
	return out
}
