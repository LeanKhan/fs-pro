package club

import (
	"fmt"
	"sort"
	"strings"
)

func unitMaps(units []any) []map[string]any {
	out := make([]map[string]any, 0, len(units))
	for _, u := range units {
		if m, ok := u.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func formPoints(form []any) int {
	p := 0
	for _, r := range form {
		if r == "W" {
			p += 3
		} else if r == "D" {
			p++
		}
	}
	return p
}

func formStr(form []any) string {
	out := ""
	for i, r := range form {
		if i > 0 {
			out += " "
		}
		out += fmt.Sprintf("%v", r)
	}
	return out
}

func buildInsights(club map[string]any, overall, home, away, vsStronger map[string]any, form []any, units []any, squad map[string]any, leagueGoalsPerGame float64, weakestStarters []any, windowOpen bool, formationStyle string) []any {
	out := []any{}
	add := func(severity, title, detail string) {
		out = append(out, map[string]any{"severity": severity, "title": title, "detail": detail})
	}
	clubName := dbName(club)
	_ = clubName

	if intOf(overall["played"]) == 0 {
		add("info", "No matches yet", "Play some matches to see how the team is doing.")
		return out
	}
	fp := formPoints(form)
	if len(form) >= 4 {
		if fp <= 2 {
			plural := "points"
			if fp == 1 {
				plural = "point"
			}
			add("problem", "Poor recent form", fmt.Sprintf("Only %d %s from the last %d (%s).", fp, plural, len(form), formStr(form)))
		} else if float64(fp) >= float64(len(form))*2.4 {
			add("good", "Strong recent form", fmt.Sprintf("%d points from the last %d (%s).", fp, len(form), formStr(form)))
		}
	}
	if intOf(home["played"]) >= 3 && intOf(away["played"]) >= 3 && ppg(home)-ppg(away) >= 1 {
		add("warning", "Much weaker away from home", fmt.Sprintf("%v points per game at home against %v away, and %v goals conceded in %v away games (%v per game).",
			roundTo(ppg(home), 2), roundTo(ppg(away), 2), away["goalsAgainst"], away["played"], roundTo(numOf(away["goalsAgainst"])/float64(intOf(away["played"])), 1)))
	}
	if intOf(overall["played"]) >= 6 {
		gap := numOf(overall["points"]) - numOf(overall["expectedPoints"])
		if gap <= -4 {
			add("info", "Results are worse than the squad deserves", fmt.Sprintf("%v points taken, but the match model expected about %v from these games - bad luck more than a weak squad; results should recover.", overall["points"], overall["expectedPoints"]))
		} else if gap >= 4 {
			add("warning", "Results are better than the squad deserves", fmt.Sprintf("%v points taken against about %v expected - some of this may not last.", overall["points"], overall["expectedPoints"]))
		} else if numOf(overall["expectedPoints"])/float64(intOf(overall["played"])) < 1.2 {
			add("problem", "The squad is the problem, not luck", fmt.Sprintf("Even on a fair run the model only expects about %v points per game - the squad is simply outmatched.", roundTo(numOf(overall["expectedPoints"])/float64(intOf(overall["played"])), 2)))
		}
	}
	if intOf(vsStronger["played"]) >= 4 && numOf(vsStronger["points"])/(float64(intOf(vsStronger["played"]))*3) < 0.2 {
		add("info", "Struggling against stronger sides", fmt.Sprintf("%vW %vD %vL against clubs rated above yours (%v-%v). That is expected to a degree: %v points expected from those games.",
			vsStronger["won"], vsStronger["drawn"], vsStronger["lost"], vsStronger["goalsFor"], vsStronger["goalsAgainst"], roundTo(numOf(vsStronger["expectedPoints"]), 1)))
	}
	if leagueGoalsPerGame > 0 {
		conceded := numOf(overall["goalsAgainst"]) / float64(intOf(overall["played"]))
		scored := numOf(overall["goalsFor"]) / float64(intOf(overall["played"]))
		if conceded >= leagueGoalsPerGame+0.5 {
			add("problem", "Leaking goals", fmt.Sprintf("%v conceded per game against a league average of %v.", roundTo(conceded, 2), leagueGoalsPerGame))
		}
		if scored <= leagueGoalsPerGame-0.4 {
			add("warning", "Not scoring enough", fmt.Sprintf("%v scored per game against a league average of %v.", roundTo(scored, 2), leagueGoalsPerGame))
		}
	}
	um := unitMaps(units)
	if len(um) > 0 {
		weakest := append([]map[string]any{}, um...)
		sort.SliceStable(weakest, func(a, b int) bool {
			return (numOf(weakest[a]["rating"]) - numOf(weakest[a]["leagueAverage"])) < (numOf(weakest[b]["rating"]) - numOf(weakest[b]["leagueAverage"]))
		})
		strongest := append([]map[string]any{}, um...)
		sort.SliceStable(strongest, func(a, b int) bool {
			return (numOf(strongest[a]["rating"]) - numOf(strongest[a]["leagueAverage"])) > (numOf(strongest[b]["rating"]) - numOf(strongest[b]["leagueAverage"]))
		})
		w := weakest[0]
		if numOf(w["rating"]) < numOf(w["leagueAverage"])-2 {
			add("problem", fmt.Sprintf("%v is the weak spot", w["unit"]), fmt.Sprintf("Rated %v - %v%s of %v in the league (average %v). The match model moves expected goals by about 0.4 for every 10 rating points here.",
				w["rating"], w["rank"], suffixOf(intOf(w["rank"])), w["of"], w["leagueAverage"]))
		}
		s := strongest[0]
		if numOf(s["rating"]) > numOf(s["leagueAverage"])+3 {
			add("good", fmt.Sprintf("%v is a strength", s["unit"]), fmt.Sprintf("Rated %v - %v%s of %v (league average %v).", s["rating"], s["rank"], suffixOf(intOf(s["rank"])), s["of"], s["leagueAverage"]))
		}
	}
	if numOf(squad["averageAge"]) >= 30 {
		add("warning", "Ageing starting eleven", fmt.Sprintf("Average age %v. Older players lose rating over a season - start planning replacements.", squad["averageAge"]))
	}
	if numOf(squad["benchAverage"]) < numOf(squad["startingAverage"])-25 {
		add("warning", "Thin bench", fmt.Sprintf("Starters average %v but the bench %v. An injury or suspension to a starter would hurt a lot.", squad["startingAverage"], squad["benchAverage"]))
	}
	if intOf(squad["injured"]) > 0 {
		plural := "s"
		if intOf(squad["injured"]) == 1 {
			plural = ""
		}
		add("warning", fmt.Sprintf("%v injured player%s", squad["injured"], plural), "Injured players are skipped by the match engine - check the team sheet.")
	}
	if !boolOf(squad["hasSavedLineup"]) {
		add("info", "No team sheet saved", "The match engine is picking the best available eleven for you. Save a team sheet to choose your own.")
	}
	if formationStyle != "" {
		s := lowerStr(formationStyle)
		if contains(s, "press") || contains(s, "attack") {
			add("info", formationStyle+" style", "Adds about +0.2 expected goals for you but also about +0.15 for the opposition - roughly break-even, and it costs you more when you are the weaker side.")
		} else if contains(s, "block") || contains(s, "defend") {
			add("info", formationStyle+" style", "Cuts about 0.25 expected goals against you but costs about 0.2 of your own - a good trade when you are the underdog.")
		}
	}
	if windowOpen && len(weakestStarters) > 0 && weakestStarters[0] != nil {
		ws := weakestStarters[0].(map[string]any)
		add("info", "The transfer window is open", fmt.Sprintf("Your lowest-rated starter is %v (%v). Upgrading weak spots is cheapest now.", ws["name"], ws["rating"]))
	}
	order := map[string]int{"problem": 0, "warning": 1, "info": 2, "good": 3}
	sort.SliceStable(out, func(a, b int) bool {
		return order[dbName2(out[a])] < order[dbName2(out[b])]
	})
	return out
}

func buildManagerStrategies(clubName string, overall map[string]any, form []any, units []any, squad map[string]any, leagueGoalsPerGame float64, weakestStarters []any, windowOpen bool) ([]any, map[string]any) {
	gamesWithoutWin := 0
	for i, r := range form {
		if i >= 5 {
			break
		}
		if r != "W" {
			gamesWithoutWin++
		}
	}
	concededRate := 1.2
	if intOf(overall["played"]) > 0 {
		concededRate = numOf(overall["goalsAgainst"]) / float64(intOf(overall["played"]))
	}
	concededHigh := concededRate >= leagueGoalsPerGame+0.4

	um := unitMaps(units)
	var weakestUnit map[string]any
	if len(um) > 0 {
		weakestUnit = um[0]
		for _, u := range um {
			if numOf(u["rating"])-numOf(u["leagueAverage"]) < numOf(weakestUnit["rating"])-numOf(weakestUnit["leagueAverage"]) {
				weakestUnit = u
			}
		}
	}
	weakestName := "Defence"
	if weakestUnit != nil {
		weakestName = dbName2(weakestUnit["unit"])
		if s, ok := weakestUnit["unit"].(string); ok && s != "" {
			weakestName = s
		}
	}

	// Jev local fallback for crisisLevel / tacticalPivot / trainingDirective.
	crisisLevel := "balanced"
	if gamesWithoutWin >= 4 || concededRate >= leagueGoalsPerGame+0.6 {
		crisisLevel = "crisis"
	} else if gamesWithoutWin >= 2 || concededRate >= leagueGoalsPerGame+0.2 {
		crisisLevel = "underperforming"
	}
	tactical := "counter-attack"
	tacticalConf := 0.45
	if weakestName == "Defence" || concededHigh {
		tactical = "low-block"
		tacticalConf = 0.65
	} else if weakestName == "Attack" {
		tactical = "counter-attack"
		tacticalConf = 0.55
	}
	training := "Physical"
	if weakestName == "Defence" {
		training = "Defending"
	} else if weakestName == "Attack" {
		training = "Attacking"
	}
	confidence := int(roundTo(tacticalConf*100, 0))

	_ = clubName
	strategies := []any{}
	unitOf := func(key string) any {
		if weakestUnit == nil {
			return nil
		}
		return weakestUnit[key]
	}
	unitRank, unitOfCount := 0, 0
	if weakestUnit != nil {
		unitRank, unitOfCount = intOf(weakestUnit["rank"]), intOf(weakestUnit["of"])
	}

	if tactical == "low-block" || concededHigh {
		strategies = append(strategies, map[string]any{
			"id": "strat-tactics", "pillar": "tactics", "severity": crisisOr(crisisLevel),
			"title":              "Shift to a Compact 5-3-2 or 4-2-3-1 Low Block",
			"diagnosis":          fmt.Sprintf("%s's defence is ranked %v of %v, conceding %v goals per match. An aggressive high line exposes your centre-backs.", clubName, unitRank, unitOfCount, roundTo(concededRate, 1)),
			"recommendation":     "Drop into a disciplined low block and adopt Counter-Attack Direct. Tightening width shields the backline and reduces expected goals conceded by ~30%.",
			"suggestedFormation": "5-3-2", "suggestedStyle": "counter-attack",
			"actionLabel": "Adjust Tactics on Team Sheet", "actionTab": 1,
		})
	} else if tactical == "counter-attack" {
		strategies = append(strategies, map[string]any{
			"id": "strat-tactics", "pillar": "tactics", "severity": "warning",
			"title":              "Adopt Fast Direct Counter-Attacking (4-3-3)",
			"diagnosis":          fmt.Sprintf("%s struggles to break down compact blocks in slow build-up play.", clubName),
			"recommendation":     "Transition through rapid vertical balls into wide channels. Direct counters exploit space behind opposition lines without compromising defensive shape.",
			"suggestedFormation": "4-3-3", "suggestedStyle": "counter-attack",
			"actionLabel": "Adjust Tactics on Team Sheet", "actionTab": 1,
		})
	} else {
		formation := "4-4-2"
		if s, ok := squad["formation"].(string); ok && s != "" {
			formation = s
		}
		strategies = append(strategies, map[string]any{
			"id": "strat-tactics", "pillar": "tactics", "severity": "opportunity",
			"title":              "Maintain Tactical Structure with Balanced Line Height",
			"diagnosis":          "Tactical underlying metrics are competitive; avoid overreacting with radical shape changes.",
			"recommendation":     "Refine mid-block pressing triggers without compromising the core shape.",
			"suggestedFormation": formation, "suggestedStyle": "balanced",
			"actionLabel": "Review Team Sheet", "actionTab": 1,
		})
	}
	if len(weakestStarters) > 0 && weakestStarters[0] != nil {
		lowest := weakestStarters[0].(map[string]any)
		ratingGap := roundTo(numOf(squad["startingAverage"])-numOf(lowest["rating"]), 1)
		sev := "warning"
		if numOf(lowest["rating"]) < 55 {
			sev = "crisis"
		}
		pos := "Starter"
		if s, ok := lowest["position"].(string); ok && s != "" {
			pos = s
		}
		strategies = append(strategies, map[string]any{
			"id": "strat-selection", "pillar": "selection", "severity": sev,
			"title":          fmt.Sprintf("Bench Underperforming Starter: %v", lowest["name"]),
			"diagnosis":      fmt.Sprintf("%v (%v, Rating %v) is trailing the starting XI average by %v rating points.", lowest["name"], pos, lowest["rating"], ratingGap),
			"recommendation": fmt.Sprintf("Rotate %v out of the starting lineup. Give minutes to fresh bench reserves or promote an eager squad alternative to eliminate defensive vulnerabilities.", lowest["name"]),
			"actionLabel":    "Adjust Lineup on Team Sheet", "actionTab": 1,
		})
	}
	trainSev := "fine_tuning"
	if weakestUnit != nil && numOf(weakestUnit["rating"]) < numOf(weakestUnit["leagueAverage"])-2 {
		trainSev = "warning"
	}
	strategies = append(strategies, map[string]any{
		"id": "strat-training", "pillar": "training", "severity": trainSev,
		"title":          fmt.Sprintf("Shift Squad Training Priority to \"%s\"", training),
		"diagnosis":      fmt.Sprintf("The %s unit (rated %v vs league average %v) is the primary statistical bottleneck.", lowerStr(weakestName), unitOf("rating"), unitOf("leagueAverage")),
		"recommendation": fmt.Sprintf("Allocate individual and squad training sessions to %s. Concentrated weekly repetitions will stimulate targeted progression before the next matchday cycle.", training),
		"actionLabel":    "Review Training in Squad Zone", "actionTab": 2,
	})
	positionNeed := "Clinical Striker (ST)"
	if weakestName == "Defence" {
		positionNeed = "Commanding Centre-Back (CB)"
	} else if weakestName == "Midfield" {
		positionNeed = "Central Midfielder (CM/DM)"
	}
	transferSev := "opportunity"
	if windowOpen {
		transferSev = "warning"
	}
	recommendation := fmt.Sprintf("Shortlist potential %s targets now so the board can move aggressively as soon as the transfer window unlocks.", positionNeed)
	if windowOpen {
		recommendation = fmt.Sprintf("The transfer window is currently open. Target a specialist %s with a minimum rating of %v to raise the floor of the squad.", positionNeed, int(mathRound(numOf(unitOf("leagueAverage")))))
	}
	strategies = append(strategies, map[string]any{
		"id": "strat-transfer", "pillar": "transfer", "severity": transferSev,
		"title":          fmt.Sprintf("Scouting Directive: Recruit a %s", positionNeed),
		"diagnosis":      fmt.Sprintf("Long-term competitive ceiling is constrained by personnel quality in the %s unit.", lowerStr(weakestName)),
		"recommendation": recommendation,
		"actionLabel":    "Explore Transfer Zone", "actionTab": 5,
	})

	headline := "STABLE TRAJECTORY: Fine-Tuning Opportunities Available"
	summary := fmt.Sprintf("%s has solid structural foundations but is losing key marginal battles. Applying the tactical adjustments below will restore balance and maximize expected points.", clubName)
	if crisisLevel == "crisis" {
		headline = "CRISIS DETECTED: Tactical Overhaul & Defensive Reinforcement Required"
		summary = fmt.Sprintf("%s is experiencing significant leakage and dropped points. Jev advises an immediate retreat from high-pressing lines into a resilient low block, benching underperforming starters, and drilling defence in training.", clubName)
	} else if crisisLevel == "underperforming" {
		headline = "UNDERPERFORMING: Tactical Tweaks & Key Rotations Advised"
	}
	advisor := map[string]any{"crisisLevel": crisisLevel, "confidence": confidence, "headline": headline, "summary": summary}
	return strategies, advisor
}

func crisisOr(crisisLevel string) string {
	if crisisLevel == "crisis" {
		return "crisis"
	}
	return "warning"
}

func dbName(m map[string]any) string { return "" }

func dbName2(v any) string {
	if m, ok := v.(map[string]any); ok {
		if s, ok := m["severity"].(string); ok {
			return s
		}
	}
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func lowerStr(s string) string { return strings.ToLower(s) }

func contains(haystack, needle string) bool { return strings.Contains(haystack, needle) }

func mathRound(v float64) int { return int(roundTo(v, 0)) }
