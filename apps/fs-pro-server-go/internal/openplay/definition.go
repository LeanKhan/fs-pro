package openplay

import (
	"fmt"
	"math"

	"fs-pro-server/internal/db"
)

// Faithful port of services/competitions/definition.ts buildDefinition plus the
// zod CompetitionDefinitionSchema defaults/transforms: fill the top-level
// defaults, validate the run rules, and emit the normalised definition the
// server snapshots.

func defaultEntry() map[string]any {
	return map[string]any{"mode": "open", "minClubs": 4, "maxClubs": nil}
}

func defaultRewards() map[string]any {
	return map[string]any{"prizeMoney": []any{}, "xp": []any{}}
}

var leagueRuleKeys = []string{
	"metric", "tiebreakers", "pointsForWin", "pointsForDraw", "minGamesToRank",
	"maxGames", "maxVsSameOpponent", "rematchCooldownDays", "challengeRange",
	"respondWithinDays", "maxOpenChallenges", "minDeclinesBeforeForfeit",
}

func asIntOK(v any) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int32:
		return int(n), true
	case int64:
		return int(n), true
	case float64:
		return int(n), true
	case float32:
		return int(n), true
	}
	return 0, false
}

func asFloatOK(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int32:
		return float64(n), true
	case int64:
		return float64(n), true
	}
	return 0, false
}

func pickKeys(src map[string]any, keys []string) map[string]any {
	out := map[string]any{}
	for _, k := range keys {
		if v, ok := src[k]; ok {
			out[k] = v
		}
	}
	return out
}

// BuildDefinition fills defaults, validates, and normalises the definition.
func BuildDefinition(input map[string]any) (map[string]any, []DefError, bool) {
	errs := []DefError{}
	out := map[string]any{}

	name, _ := input["Name"].(string)
	if name == "" {
		errs = append(errs, DefError{Path: "Name", Message: "String must contain at least 1 character(s)"})
	}
	out["Name"] = name
	if d, ok := input["Description"].(string); ok {
		out["Description"] = d
	}

	prestige := 2
	if v, ok := asIntOK(input["Prestige"]); ok {
		prestige = v
	}
	if prestige < 1 || prestige > 5 {
		errs = append(errs, DefError{Path: "Prestige", Message: "Number must be between 1 and 5"})
	}
	out["Prestige"] = prestige

	entry := defaultEntry()
	for k, v := range mapOf(input["Entry"]) {
		entry[k] = v
	}
	entry = pickKeys(entry, []string{"mode", "minClubs", "maxClubs", "minLevel", "maxLevel", "minElo", "maxElo",
		"minRating", "maxRating", "countryIds", "requiresWinOf", "excludesEntrantsOf", "entryFee", "lateEntryUntilDay"})
	out["Entry"] = entry

	stagesIn := toAnyList(input["Stages"])
	if len(stagesIn) == 0 {
		errs = append(errs, DefError{Path: "Stages", Message: "Array must contain at least 1 element(s)"})
	}
	stages := make([]any, 0, len(stagesIn))
	for _, s := range toMapList(input["Stages"]) {
		stages = append(stages, normalizeStage(s))
	}
	out["Stages"] = stages

	lastType := ""
	if len(stagesIn) > 0 {
		lastType = db.StringField(toMapList(input["Stages"])[len(toMapList(input["Stages"]))-1], "type")
	}
	wc := mapOf(input["WinCondition"])
	if wc == nil {
		if lastType == "knockout" && len(stagesIn) == 1 {
			wc = map[string]any{"type": "last-standing"}
		} else {
			wc = map[string]any{"type": "final-stage"}
		}
	}
	out["WinCondition"] = normalizeWinCondition(wc)

	rewards := defaultRewards()
	for k, v := range mapOf(input["Rewards"]) {
		rewards[k] = v
	}
	out["Rewards"] = pickKeys(rewards, []string{"prizeMoney", "participationFee", "eloBonus", "trophy", "xp", "xpPerMatch"})

	if o, ok := input["Outcomes"]; ok && o != nil {
		out["Outcomes"] = o
	}
	if r, ok := input["Recurrence"]; ok {
		out["Recurrence"] = r
	}

	errs = append(errs, runRules(out)...)
	if len(errs) > 0 {
		return nil, errs, false
	}
	return out, []DefError{}, true
}

func normalizeStage(s map[string]any) map[string]any {
	switch db.StringField(s, "type") {
	case "knockout":
		return pickKeys(s, []string{"type", "legs", "tieDays", "seeding", "drawAtEnd"})
	case "pyramid":
		out := pickKeys(s, []string{"type", "poolSize", "rounds", "promote", "relegate", "bottomFill"})
		if r := mapOf(s["rules"]); r != nil {
			out["rules"] = pickKeys(r, leagueRuleKeys)
		}
		return out
	case "groups":
		out := pickKeys(s, []string{"type", "days", "groupSize"})
		if r := mapOf(s["rules"]); r != nil {
			out["rules"] = pickKeys(r, leagueRuleKeys)
		}
		if a := mapOf(s["advance"]); a != nil {
			out["advance"] = pickKeys(a, []string{"top", "perGroup", "bestRunnersUp"})
		}
		return out
	default:
		out := pickKeys(s, []string{"type", "days"})
		if r := mapOf(s["rules"]); r != nil {
			out["rules"] = pickKeys(r, leagueRuleKeys)
		}
		if a := mapOf(s["advance"]); a != nil {
			out["advance"] = pickKeys(a, []string{"top", "perGroup", "bestRunnersUp"})
		}
		return out
	}
}

func normalizeWinCondition(wc map[string]any) map[string]any {
	switch db.StringField(wc, "type") {
	case "first-to":
		return pickKeys(wc, []string{"type", "metric", "target"})
	case "best-at-end":
		return pickKeys(wc, []string{"type", "metric"})
	default:
		return pickKeys(wc, []string{"type"})
	}
}

func clubsAdvancing(stage map[string]any, clubsIn any) any {
	switch db.StringField(stage, "type") {
	case "knockout":
		return 1
	case "pyramid":
		return clubsIn
	}
	advance := mapOf(stage["advance"])
	if advance == nil {
		return clubsIn
	}
	top, _ := asIntOK(advance["top"])
	best := 0
	if v, ok := asIntOK(advance["bestRunnersUp"]); ok {
		best = v
	}
	if db.StringField(stage, "type") == "groups" && boolVal(advance["perGroup"]) {
		if clubsIn == nil {
			return nil
		}
		groupSize, _ := asIntOK(stage["groupSize"])
		if groupSize <= 0 {
			return nil
		}
		groups := int(math.Ceil(float64(intVal(clubsIn)) / float64(groupSize)))
		return groups*top + best
	}
	return top + best
}

// runRules ports the schema's superRefine.
func runRules(def map[string]any) []DefError {
	errs := []DefError{}
	entry := mapOf(def["Entry"])
	stages := toMapList(def["Stages"])
	wc := mapOf(def["WinCondition"])

	if entry["maxClubs"] != nil && entry["minClubs"] != nil && intVal(entry["maxClubs"]) < intVal(entry["minClubs"]) {
		errs = append(errs, DefError{Path: "Entry.maxClubs", Message: "maxClubs is below minClubs"})
	}
	if entry["minLevel"] != nil && entry["maxLevel"] != nil && intVal(entry["minLevel"]) > intVal(entry["maxLevel"]) {
		errs = append(errs, DefError{Path: "Entry.minLevel", Message: "minLevel is above maxLevel"})
	}
	if entry["minElo"] != nil && entry["maxElo"] != nil && numVal(entry["minElo"]) > numVal(entry["maxElo"]) {
		errs = append(errs, DefError{Path: "Entry.minElo", Message: "minElo is above maxElo"})
	}

	hasPyramid := false
	for _, s := range stages {
		if db.StringField(s, "type") == "pyramid" {
			hasPyramid = true
		}
	}
	if hasPyramid && len(stages) != 1 {
		errs = append(errs, DefError{Path: "Stages", Message: "A pyramid stage must be the only stage"})
	}

	var clubsIn any
	if entry["maxClubs"] != nil {
		clubsIn = intVal(entry["maxClubs"])
	}
	for i, stage := range stages {
		isLast := i == len(stages)-1
		st := db.StringField(stage, "type")
		if st == "pyramid" {
			continue
		}
		if st == "knockout" && !isLast {
			errs = append(errs, DefError{Path: fmt.Sprintf("Stages.%d", i), Message: "A knockout stage must be the last stage"})
		}
		if st == "groups" && entry["maxClubs"] != nil && intVal(stage["groupSize"]) > intVal(entry["maxClubs"]) {
			errs = append(errs, DefError{Path: fmt.Sprintf("Stages.%d.groupSize", i), Message: "Group size is larger than the maximum number of clubs"})
		}
		if !isLast && st != "knockout" && mapOf(stage["advance"]) == nil {
			errs = append(errs, DefError{Path: fmt.Sprintf("Stages.%d.advance", i), Message: "Every stage except the last must say who advances"})
		}
		out := clubsAdvancing(stage, clubsIn)
		if !isLast && st != "knockout" && out != nil && intVal(out) < 2 {
			errs = append(errs, DefError{Path: fmt.Sprintf("Stages.%d.advance", i), Message: "At least 2 clubs must advance into the next stage"})
		}
		if clubsIn != nil && out != nil && st != "knockout" && intVal(out) > intVal(clubsIn) {
			errs = append(errs, DefError{Path: fmt.Sprintf("Stages.%d.advance", i), Message: "More clubs advance than can enter this stage"})
		}
		clubsIn = out
	}

	onlyKnockout := len(stages) > 0
	for _, s := range stages {
		if db.StringField(s, "type") != "knockout" {
			onlyKnockout = false
		}
	}
	if onlyKnockout && (db.StringField(wc, "type") == "first-to" || db.StringField(wc, "type") == "best-at-end") {
		errs = append(errs, DefError{Path: "WinCondition", Message: "A knockout-only competition can only be won by the final stage (last standing)"})
	}
	if db.StringField(wc, "type") == "last-standing" && (len(stages) == 0 || db.StringField(stages[len(stages)-1], "type") != "knockout") {
		errs = append(errs, DefError{Path: "WinCondition", Message: "Last standing needs a knockout as the final stage"})
	}
	return errs
}

// CompetitionDefinitionInput builds the builder input from a Competitions row
// (definition.ts competitionDefinition), used when publishing.
func competitionDefinitionInput(c map[string]any) map[string]any {
	input := map[string]any{
		"Name":       db.StringField(c, "Name"),
		"Prestige":   intVal(c["Prestige"]),
		"Stages":     c["Stages"],
		"Entry":      c["Entry"],
		"Rewards":    c["Rewards"],
		"Recurrence": c["Recurrence"],
	}
	if c["Description"] != nil {
		input["Description"] = c["Description"]
	}
	if c["WinCondition"] != nil {
		input["WinCondition"] = c["WinCondition"]
	}
	if c["Outcomes"] != nil {
		input["Outcomes"] = c["Outcomes"]
	}
	return input
}
