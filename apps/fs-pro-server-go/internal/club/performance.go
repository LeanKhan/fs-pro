package club

import (
	"context"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"fs-pro-server/internal/db"
)

// Club-performance analytics, ported from services/analytics/
// club-performance.service.ts + team-strength.ts, using Jev's local fallback.

func roundTo(n float64, places int) float64 {
	p := math.Pow(10, float64(places))
	return math.Round(n*p) / p
}

func avg(list []float64) float64 {
	if len(list) == 0 {
		return 0
	}
	s := 0.0
	for _, v := range list {
		s += v
	}
	return s / float64(len(list))
}

func clampF(x, lo, hi float64) float64 { return math.Min(hi, math.Max(lo, x)) }

func poisson(k int, lambda float64) float64 {
	factorial := 1.0
	for i := 2; i <= k; i++ {
		factorial *= float64(i)
	}
	return math.Exp(-lambda) * math.Pow(lambda, float64(k)) / factorial
}

func expectedPoints(lf, la float64) float64 {
	win, draw := 0.0, 0.0
	for f := 0; f <= 10; f++ {
		for a := 0; a <= 10; a++ {
			p := poisson(f, lf) * poisson(a, la)
			if f > a {
				win += p
			} else if f == a {
				draw += p
			}
		}
	}
	return 3*win + draw
}

func playerFullName(p map[string]any) string {
	return strings.TrimSpace(db.StringField(p, "FirstName") + " " + db.StringField(p, "LastName"))
}

func injuryActive(p map[string]any) bool {
	injury, _ := p["Injury"].(map[string]any)
	return injury != nil && numOf(injury["daysRemaining"]) > 0
}

// --- team strength ---------------------------------------------------------

type unitRatings struct {
	att, mid, def, gk float64
	xi                []map[string]any
}

func selectStartingLineup(players []map[string]any, preferred []string) (xi []map[string]any, gk map[string]any, defenders, midfielders, attackers []map[string]any) {
	healthy := []map[string]any{}
	for _, p := range players {
		if !injuryActive(p) {
			healthy = append(healthy, p)
		}
	}
	sorted := append([]map[string]any{}, healthy...)
	ratingOr := func(p map[string]any) float64 {
		if p["Rating"] == nil {
			return 50
		}
		return numOf(p["Rating"])
	}
	sort.SliceStable(sorted, func(a, b int) bool { return ratingOr(sorted[a]) > ratingOr(sorted[b]) })
	chosen := map[string]bool{}
	add := func(p map[string]any) {
		id := db.StringField(p, "_id")
		if id != "" && !chosen[id] {
			chosen[id] = true
			xi = append(xi, p)
		}
	}
	if len(preferred) > 0 {
		for _, pID := range preferred {
			if len(xi) >= 11 {
				break
			}
			for _, p := range healthy {
				if db.StringField(p, "_id") == pID {
					add(p)
					break
				}
			}
		}
	}
	hasGK := false
	for _, p := range xi {
		if db.StringField(p, "Position") == "GK" {
			hasGK = true
		}
	}
	if !hasGK {
		var g map[string]any
		for _, p := range sorted {
			if db.StringField(p, "Position") == "GK" {
				g = p
				break
			}
		}
		if g == nil && len(sorted) > 0 {
			g = sorted[0]
		}
		if g != nil {
			add(g)
		}
	}
	pick := func(pos string, max int) {
		count := 0
		for _, p := range xi {
			if db.StringField(p, "Position") == pos {
				count++
			}
		}
		for _, p := range sorted {
			if count >= max {
				break
			}
			if db.StringField(p, "Position") == pos {
				before := len(xi)
				add(p)
				if len(xi) > before {
					count++
				}
			}
		}
	}
	pick("DEF", 4)
	pick("MID", 4)
	pick("ATT", 2)
	for _, p := range sorted {
		if len(xi) >= 11 {
			break
		}
		add(p)
	}
	for _, p := range xi {
		switch db.StringField(p, "Position") {
		case "GK":
			gk = p
		case "DEF":
			defenders = append(defenders, p)
		case "MID":
			midfielders = append(midfielders, p)
		case "ATT":
			attackers = append(attackers, p)
		}
	}
	if gk == nil && len(xi) > 0 {
		gk = xi[0]
	}
	return
}

func computeUnitRating(players []map[string]any, fallback float64) float64 {
	if len(players) == 0 {
		return fallback
	}
	sum := 0.0
	for _, p := range players {
		r := fallback
		if p["Rating"] != nil {
			r = numOf(p["Rating"])
		}
		sum += r
	}
	return sum / float64(len(players))
}

func unitRatingsForClub(club map[string]any) unitRatings {
	players := toMapList(club["Players"])
	preferred := []string{}
	if lineup, _ := club["Lineup"].(map[string]any); lineup != nil {
		for _, v := range toAnyList(lineup["startingXI"]) {
			if s, ok := v.(string); ok {
				preferred = append(preferred, s)
			}
		}
	}
	xi, gk, defs, mids, atts := selectStartingLineup(players, preferred)
	ovr := 60.0
	if club["Rating"] != nil {
		ovr = numOf(club["Rating"])
	}
	attFallback := ovr
	if club["AttackingClass"] != nil {
		attFallback = numOf(club["AttackingClass"])
	}
	defFallback := ovr
	if club["DefensiveClass"] != nil {
		defFallback = numOf(club["DefensiveClass"])
	}
	gkRating := ovr
	if gk != nil && gk["Rating"] != nil {
		gkRating = numOf(gk["Rating"])
	}
	orderedXI := append([]map[string]any{}, xi...)
	_ = orderedXI
	return unitRatings{
		att: computeUnitRating(atts, attFallback),
		mid: computeUnitRating(mids, ovr),
		def: computeUnitRating(defs, defFallback),
		gk:  gkRating,
		xi:  collectXI(gk, defs, mids, atts),
	}
}

func collectXI(gk map[string]any, defs, mids, atts []map[string]any) []map[string]any {
	out := []map[string]any{}
	if gk != nil {
		out = append(out, gk)
	}
	out = append(out, defs...)
	out = append(out, mids...)
	out = append(out, atts...)
	return out
}

func styleBonus(styleName string) (att, def float64) {
	s := strings.ToLower(styleName)
	if strings.Contains(s, "press") || strings.Contains(s, "attack") {
		return 0.2, -0.15
	}
	if strings.Contains(s, "block") || strings.Contains(s, "defend") {
		return -0.2, 0.25
	}
	return 0, 0
}

func computeExpectedGoals(home, away unitRatings, homeStyle, awayStyle string) (float64, float64) {
	hAtt, hDef := styleBonus(homeStyle)
	aAtt, aDef := styleBonus(awayStyle)
	homeStrengthDiff := (home.att + home.mid - (away.def + away.gk)) / 25
	awayStrengthDiff := (away.att + away.mid - (home.def + home.gk)) / 25
	return clampF(1.4+0.25+homeStrengthDiff+hAtt-aDef, 0.2, 5.0),
		clampF(1.15+awayStrengthDiff+aAtt-hDef, 0.15, 4.5)
}

// --- loading ---------------------------------------------------------------

func (r *Repository) loadPerfClubs(ctx context.Context) ([]map[string]any, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Clubs"`)
	if err != nil {
		return nil, err
	}
	clubs, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	playerRows, err := r.q.Query(ctx, `SELECT * FROM "Players" WHERE "ClubId" IS NOT NULL AND "isRetired" = false`)
	if err != nil {
		return nil, err
	}
	players, err := db.ScanAll(playerRows)
	if err != nil {
		return nil, err
	}
	byClub := map[string][]map[string]any{}
	for _, p := range players {
		id := db.StringField(p, "ClubId")
		byClub[id] = append(byClub[id], p)
	}
	for _, c := range clubs {
		list := byClub[db.StringField(c, "_id")]
		playersAny := make([]any, 0, len(list))
		for _, p := range list {
			playersAny = append(playersAny, p)
		}
		c["Players"] = playersAny
	}
	return clubs, nil
}

var yearRE = regexp.MustCompile(`^Y\d+$`)

func (r *Repository) listYears(ctx context.Context) ([]map[string]any, error) {
	cal, _, err := r.one(ctx, `SELECT * FROM "Calendars" LIMIT 1`)
	if err != nil {
		return nil, err
	}
	rows, err := r.q.Query(ctx, `SELECT * FROM "SeasonReports" WHERE "FromDay" IS NOT NULL`)
	if err != nil {
		return nil, err
	}
	past, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	years := []map[string]any{}
	for _, rep := range past {
		label := db.StringField(rep, "Year")
		if !yearRE.MatchString(label) {
			continue
		}
		n, _ := strconv.Atoi(strings.TrimPrefix(label, "Y"))
		years = append(years, map[string]any{"label": label, "number": n, "fromDay": intOf(rep["FromDay"]), "toDay": intOf(rep["ToDay"]), "current": false})
	}
	if cal != nil {
		n := intOf(cal["CurrentYear"])
		years = append(years, map[string]any{"label": "Y" + strconv.Itoa(n), "number": n, "fromDay": intOf(cal["YearStartDay"]), "toDay": intOf(cal["CurrentDay"]), "current": true})
	}
	sort.SliceStable(years, func(a, b int) bool { return intOf(years[a]["number"]) < intOf(years[b]["number"]) })
	return years, nil
}

func yearLabelFor(years []map[string]any, day any) string {
	if day == nil {
		return ""
	}
	d := intOf(day)
	for _, y := range years {
		if d >= intOf(y["fromDay"]) && d <= intOf(y["toDay"]) {
			return db.StringField(y, "label")
		}
	}
	return ""
}

func (r *Repository) one(ctx context.Context, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

// --- summary maths ---------------------------------------------------------

func summariseMatches(matches []map[string]any) map[string]any {
	s := map[string]any{"played": len(matches), "won": 0, "drawn": 0, "lost": 0, "goalsFor": 0, "goalsAgainst": 0, "points": 0, "expectedPoints": 0.0}
	won, drawn, lost, gf, ga, pts := 0, 0, 0, 0, 0, 0
	ep := 0.0
	for _, m := range matches {
		gf += intOf(m["goalsFor"])
		ga += intOf(m["goalsAgainst"])
		ep += numOf(m["expectedPoints"])
		switch db.StringField(m, "result") {
		case "W":
			won++
			pts += 3
		case "D":
			drawn++
			pts++
		default:
			lost++
		}
	}
	s["won"], s["drawn"], s["lost"], s["goalsFor"], s["goalsAgainst"], s["points"] = won, drawn, lost, gf, ga, pts
	s["expectedPoints"] = roundTo(ep, 1)
	return s
}

func ppg(r map[string]any) float64 {
	if intOf(r["played"]) == 0 {
		return 0
	}
	return numOf(r["points"]) / float64(intOf(r["played"]))
}

func suffixOf(n int) string {
	mod100 := n % 100
	if mod100 >= 11 && mod100 <= 13 {
		return "th"
	}
	switch n % 10 {
	case 1:
		return "st"
	case 2:
		return "nd"
	case 3:
		return "rd"
	}
	return "th"
}

func numOf(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int32:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return 0
	}
}

func toMapList(v any) []map[string]any {
	list, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(list))
	for _, item := range list {
		if m, ok := item.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func toAnyList(v any) []any {
	list, ok := v.([]any)
	if !ok {
		return nil
	}
	return list
}

func mapOf(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}
