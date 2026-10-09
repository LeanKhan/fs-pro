package club

import (
	"context"
	"fmt"
	"math"
	"sort"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/performance"
)

// GetClubPerformance is GET /api/clubs/{id}/performance.
func (r *Repository) GetClubPerformance(ctx context.Context, clubID, requestedYear string) (map[string]any, error) {
	clubs, err := r.loadPerfClubs(ctx)
	if err != nil {
		return nil, err
	}
	var club map[string]any
	xpByID := map[string]int{}
	for _, c := range clubs {
		xpByID[db.StringField(c, "_id")] = intOf(c["XP"])
		if db.StringField(c, "_id") == clubID {
			club = c
		}
	}
	if club == nil {
		return nil, fmt.Errorf("Club not found")
	}
	cal, _, err := r.one(ctx, `SELECT * FROM "Calendars" LIMIT 1`)
	if err != nil {
		return nil, err
	}
	thresholds := toAnyList(cal["LevelThresholds"])
	levelOf := func(id string) int { return performance.LevelForXp(xpByID[id], thresholds) }
	level := levelOf(clubID)
	peers := []map[string]any{}
	for _, c := range clubs {
		if levelOf(db.StringField(c, "_id")) == level {
			peers = append(peers, c)
		}
	}
	years, err := r.listYears(ctx)
	if err != nil {
		return nil, err
	}
	yearOf := func(day any) string { return yearLabelFor(years, day) }

	clubCode := db.StringField(club, "ClubCode")
	playedRows, err := r.queryFixtures(ctx, `SELECT * FROM "Fixtures" WHERE "Played" = true AND ("Home" = $1 OR "Away" = $1)`, clubCode)
	if err != nil {
		return nil, err
	}
	yearsWithMatches := []string{}
	for _, y := range years {
		label := db.StringField(y, "label")
		matched := false
		for _, f := range playedRows {
			if yearOf(f["ScheduledDay"]) == label {
				matched = true
				break
			}
		}
		if matched {
			yearsWithMatches = append(yearsWithMatches, label)
		}
	}
	year := requestedYear
	if year == "" {
		if len(yearsWithMatches) > 0 {
			year = yearsWithMatches[len(yearsWithMatches)-1]
		} else if len(years) > 0 {
			year = db.StringField(years[len(years)-1], "label")
		}
	}
	inYear := []map[string]any{}
	for _, f := range playedRows {
		if yearOf(f["ScheduledDay"]) == year {
			inYear = append(inYear, f)
		}
	}
	sort.SliceStable(inYear, func(a, b int) bool { return intOf(inYear[a]["ScheduledDay"]) < intOf(inYear[b]["ScheduledDay"]) })

	unitsByCode := map[string]unitRatings{}
	for _, c := range clubs {
		unitsByCode[db.StringField(c, "ClubCode")] = unitRatingsForClub(c)
	}
	mine := unitsByCode[clubCode]
	ratingByCode := map[string]float64{}
	for _, c := range clubs {
		ratingByCode[db.StringField(c, "ClubCode")] = numOf(c["Rating"])
	}

	matches := []map[string]any{}
	for _, f := range inYear {
		details := mapOf(f["Details"])
		if details == nil || details["HomeTeamScore"] == nil || details["AwayTeamScore"] == nil {
			continue
		}
		isHome := db.StringField(f, "Home") == clubCode
		opponent := db.StringField(f, "Away")
		if !isHome {
			opponent = db.StringField(f, "Home")
		}
		theirs, ok := unitsByCode[opponent]
		goalsFor, goalsAgainst := intOf(details["HomeTeamScore"]), intOf(details["AwayTeamScore"])
		if !isHome {
			goalsFor, goalsAgainst = goalsAgainst, goalsFor
		}
		xgFor, xgAgainst := 1.3, 1.3
		if ok {
			style := ""
			if t := mapOf(club["Tactic"]); t != nil {
				style = db.StringField(t, "styleName")
			}
			if isHome {
				lh, la := computeExpectedGoals(mine, theirs, style, "")
				xgFor, xgAgainst = lh, la
			} else {
				lh, la := computeExpectedGoals(theirs, mine, "", style)
				xgFor, xgAgainst = la, lh
			}
		}
		result := "L"
		if goalsFor > goalsAgainst {
			result = "W"
		} else if goalsFor == goalsAgainst {
			result = "D"
		}
		venue := "away"
		if isHome {
			venue = "home"
		}
		matches = append(matches, map[string]any{
			"fixtureId": db.StringField(f, "_id"), "day": f["ScheduledDay"], "competition": orEmpty(db.StringField(f, "LeagueCode")),
			"venue": venue, "opponent": opponent, "opponentRating": roundTo(ratingByCode[opponent], 1),
			"goalsFor": goalsFor, "goalsAgainst": goalsAgainst, "result": result,
			"expectedGoalsFor": roundTo(xgFor, 2), "expectedGoalsAgainst": roundTo(xgAgainst, 2),
			"expectedPoints": roundTo(expectedPoints(xgFor, xgAgainst), 2),
		})
	}

	myRating := numOf(club["Rating"])
	overall := summariseMatches(matches)
	homeM := filterMatches(matches, func(m map[string]any) bool { return db.StringField(m, "venue") == "home" })
	awayM := filterMatches(matches, func(m map[string]any) bool { return db.StringField(m, "venue") == "away" })
	strongM := filterMatches(matches, func(m map[string]any) bool { return numOf(m["opponentRating"]) > myRating })
	weakM := filterMatches(matches, func(m map[string]any) bool { return numOf(m["opponentRating"]) <= myRating })
	homeS := summariseMatches(homeM)
	awayS := summariseMatches(awayM)
	vsStronger := summariseMatches(strongM)
	vsWeaker := summariseMatches(weakM)
	form := []any{}
	for i := len(matches) - 1; i >= 0 && len(form) < 5; i-- {
		form = append(form, matches[i]["result"])
	}

	leagueCode := fmt.Sprintf("Level %d", level)
	var span map[string]any
	for _, y := range years {
		if db.StringField(y, "label") == year {
			span = y
		}
	}
	peerCodes := map[string]bool{}
	for _, p := range peers {
		peerCodes[db.StringField(p, "ClubCode")] = true
	}
	leagueGoalsPerGame := 0.0
	if span != nil {
		leagueRows, err := r.queryFixtures(ctx, `SELECT "Details","Home","Away" FROM "Fixtures" WHERE "Played" = true AND "ScheduledDay" BETWEEN $1 AND $2`, intOf(span["fromDay"]), intOf(span["toDay"]))
		if err != nil {
			return nil, err
		}
		filtered := []map[string]any{}
		for _, f := range leagueRows {
			if peerCodes[db.StringField(f, "Home")] || peerCodes[db.StringField(f, "Away")] {
				filtered = append(filtered, f)
			}
		}
		total, n := 0, 0
		for _, f := range filtered {
			d := mapOf(f["Details"])
			if d == nil || d["HomeTeamScore"] == nil || d["AwayTeamScore"] == nil {
				continue
			}
			total += intOf(d["HomeTeamScore"]) + intOf(d["AwayTeamScore"])
			n++
		}
		if n > 0 {
			leagueGoalsPerGame = roundTo(float64(total)/float64(2*n), 2)
		}
	}

	unitDefs := []struct{ unit, key string }{{"Attack", "att"}, {"Midfield", "mid"}, {"Defence", "def"}, {"Goalkeeper", "gk"}}
	units := []any{}
	for _, def := range unitDefs {
		peerValues := []float64{}
		for _, p := range peers {
			u := unitsByCode[db.StringField(p, "ClubCode")]
			peerValues = append(peerValues, unitField(u, def.key))
		}
		rating := unitField(mine, def.key)
		above := 0
		for _, v := range peerValues {
			if v > rating {
				above++
			}
		}
		units = append(units, map[string]any{"unit": def.unit, "rating": roundTo(rating, 1), "leagueAverage": roundTo(avg(peerValues), 1), "rank": above + 1, "of": len(peerValues)})
	}

	players := toMapList(club["Players"])
	xiIDs := map[string]bool{}
	for _, p := range mine.xi {
		xiIDs[db.StringField(p, "_id")] = true
	}
	bench := []map[string]any{}
	injuredCount := 0
	for _, p := range players {
		if !xiIDs[db.StringField(p, "_id")] {
			bench = append(bench, p)
		}
		if injuryActive(p) {
			injuredCount++
		}
	}
	xiRatings, xiAges := []float64{}, []float64{}
	for _, p := range mine.xi {
		xiRatings = append(xiRatings, numOf(p["Rating"]))
		xiAges = append(xiAges, numOf(p["Age"]))
	}
	benchRatings := []float64{}
	for _, p := range bench {
		benchRatings = append(benchRatings, numOf(p["Rating"]))
	}
	hasSaved := false
	if lineup := mapOf(club["Lineup"]); lineup != nil {
		hasSaved = len(toAnyList(lineup["startingXI"])) > 0
	}
	var formation, style any
	if t := mapOf(club["Tactic"]); t != nil {
		formation = nilIf(chairString(t, "formationName"))
		style = nilIf(chairString(t, "styleName"))
	}
	squad := map[string]any{
		"size": len(players), "startingAverage": roundTo(avg(xiRatings), 1), "benchAverage": roundTo(avg(benchRatings), 1),
		"averageAge": roundTo(avg(xiAges), 1), "injured": injuredCount, "hasSavedLineup": hasSaved,
		"formation": formation, "style": style,
	}

	fixtureIDs, playerIDs := []string{}, []string{}
	for _, m := range matches {
		fixtureIDs = append(fixtureIDs, db.StringField(m, "fixtureId"))
	}
	for _, p := range players {
		playerIDs = append(playerIDs, db.StringField(p, "_id"))
	}
	stats := map[string]*playerStat{}
	if len(fixtureIDs) > 0 && len(playerIDs) > 0 {
		rows, err := r.q.Query(ctx, `SELECT * FROM "PlayerMatchDetails" WHERE "FixtureId" = ANY($1) AND "PlayerId" = ANY($2)`, fixtureIDs, playerIDs)
		if err != nil {
			return nil, err
		}
		list, err := db.ScanAll(rows)
		if err != nil {
			return nil, err
		}
		for _, row := range list {
			id := db.StringField(row, "PlayerId")
			s := stats[id]
			if s == nil {
				s = &playerStat{}
				stats[id] = s
			}
			s.apps++
			s.goals += intOf(row["Goals"])
			s.assists += intOf(row["Assists"])
			s.points += numOf(row["Points"])
		}
	}
	toPlayer := func(p map[string]any) map[string]any {
		id := db.StringField(p, "_id")
		s := stats[id]
		apps, goals, assists := 0, 0, 0
		ap := 0.0
		if s != nil {
			apps, goals, assists = s.apps, s.goals, s.assists
			if s.apps > 0 {
				ap = roundTo(s.points/float64(s.apps), 2)
			}
		}
		var pos any
		if db.StringField(p, "Position") != "" {
			pos = db.StringField(p, "Position")
		}
		var age any
		if p["Age"] != nil {
			age = intOf(p["Age"])
		}
		return map[string]any{
			"playerId": id, "name": playerFullName(p), "position": pos, "rating": roundTo(numOf(p["Rating"]), 1),
			"age": age, "appearances": apps, "goals": goals, "assists": assists, "averagePoints": ap,
		}
	}
	topPlayers := []any{}
	for _, p := range players {
		tp := toPlayer(p)
		if intOf(tp["appearances"]) >= 2 {
			topPlayers = append(topPlayers, tp)
		}
	}
	sort.SliceStable(topPlayers, func(a, b int) bool {
		return numOf(topPlayers[a].(map[string]any)["averagePoints"]) > numOf(topPlayers[b].(map[string]any)["averagePoints"])
	})
	if len(topPlayers) > 5 {
		topPlayers = topPlayers[:5]
	}
	weakest := append([]map[string]any{}, mine.xi...)
	sort.SliceStable(weakest, func(a, b int) bool { return numOf(weakest[a]["Rating"]) < numOf(weakest[b]["Rating"]) })
	if len(weakest) > 3 {
		weakest = weakest[:3]
	}
	weakestStarters := []any{}
	for _, p := range weakest {
		weakestStarters = append(weakestStarters, toPlayer(p))
	}

	windowOpen := boolOf(cal["TransferWindowOpen"])
	insights := buildInsights(club, overall, homeS, awayS, vsStronger, form, units, squad, leagueGoalsPerGame, weakestStarters, windowOpen, strOf(style))
	strategies, advisor := buildManagerStrategies(db.StringField(club, "Name"), overall, form, units, squad, leagueGoalsPerGame, weakestStarters, windowOpen)

	return map[string]any{
		"clubId": clubID, "clubName": db.StringField(club, "Name"), "year": year,
		"availableYears": yearsWithMatches, "leagueCode": nilIf(leagueCode),
		"overall": overall, "home": homeS, "away": awayS, "vsStronger": vsStronger, "vsWeaker": vsWeaker,
		"form": form, "leagueGoalsPerGame": map[string]any{"scored": leagueGoalsPerGame, "conceded": leagueGoalsPerGame},
		"units": units, "squad": squad, "matches": matches, "topPlayers": topPlayers,
		"weakestStarters": weakestStarters, "insights": insights, "strategies": strategies, "advisorSummary": advisor,
	}, nil
}

type playerStat struct {
	apps, goals, assists int
	points               float64
}

func (r *Repository) queryFixtures(ctx context.Context, sql string, args ...any) ([]map[string]any, error) {
	rows, err := r.q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

func filterMatches(list []map[string]any, keep func(map[string]any) bool) []map[string]any {
	out := []map[string]any{}
	for _, m := range list {
		if keep(m) {
			out = append(out, m)
		}
	}
	return out
}

func unitField(u unitRatings, key string) float64 {
	switch key {
	case "att":
		return u.att
	case "mid":
		return u.mid
	case "def":
		return u.def
	case "gk":
		return u.gk
	}
	return 0
}

func nilIf(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func strOf(v any) string {
	s, _ := v.(string)
	return s
}

func chairString(m map[string]any, key string) string { return db.StringField(m, key) }

func boolOf(v any) bool { b, _ := v.(bool); return b }

func orEmpty(s string) string { return s }

var _ = math.Abs
