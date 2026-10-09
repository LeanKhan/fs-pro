package program

import (
	"context"
	"sort"
	"time"

	"fs-pro-server/internal/db"
)

// BuildStepFacts ports program-facts.service.ts buildStepFacts: the pure
// StepFacts snapshot handed to the program engine.

const programXPPerStar = 3 // PROGRAM_REWARD_XP: 1->3, 2->9, 3->18
const programXPCap = 54
const playBlockedTTLMS = 15 * 60_000

// ProgramXpFromStars sums capped XP over a Step -> stars map, excluding a step.
func ProgramXpFromStars(stepStars map[string]any, exclude string) int {
	total := 0
	for step, stars := range stepStars {
		if step == exclude {
			continue
		}
		switch intOf(stars) {
		case 1:
			total += 3
		case 2:
			total += 9
		case 3:
			total += 18
		}
	}
	if total > programXPCap {
		return programXPCap
	}
	return total
}

// resolveActiveStep maps a persisted step to the active step, or "" when done.
func resolveActiveStep(step string) string {
	switch step {
	case "not_started":
		return "manager"
	case "done":
		return ""
	case "manager", "players", "facilities", "level1":
		return step
	}
	return ""
}

func (r *Repository) squadSummary(ctx context.Context, clubID string) (map[string]any, error) {
	rows, err := r.q.Query(ctx, `SELECT "Position","Rating" FROM "Players" WHERE "ClubId" = $1 AND "isSigned" = true AND "isRetired" = false`, clubID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	summary := map[string]any{"total": 0, "gk": 0, "def": 0, "mid": 0, "att": 0, "medianRating": 0}
	ratings := []float64{}
	for _, p := range list {
		summary["total"] = intOf(summary["total"]) + 1
		switch db.StringField(p, "Position") {
		case "GK":
			summary["gk"] = intOf(summary["gk"]) + 1
		case "DEF":
			summary["def"] = intOf(summary["def"]) + 1
		case "MID":
			summary["mid"] = intOf(summary["mid"]) + 1
		case "ATT":
			summary["att"] = intOf(summary["att"]) + 1
		}
		ratings = append(ratings, floatOf(p["Rating"]))
	}
	sort.Sort(sort.Reverse(sort.Float64Slice(ratings)))
	if len(ratings) > 11 {
		ratings = ratings[:11]
	}
	if len(ratings) > 0 {
		mid := len(ratings) / 2
		if len(ratings)%2 == 1 {
			summary["medianRating"] = ratings[mid]
		} else {
			summary["medianRating"] = (ratings[mid-1] + ratings[mid]) / 2
		}
	}
	return summary, nil
}

func (r *Repository) managerFacts(ctx context.Context, clubID string) (map[string]any, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Managers" WHERE "ClubId" = $1 AND "isEmployed" = true LIMIT 1`, clubID)
	if err != nil {
		return nil, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return nil, err
	}
	tactics := default50(m["Tactics"])
	motivation := default50(m["Motivation"])
	development := default50(m["Development"])
	discipline := default50(m["Discipline"])
	overall := ManagerOverall(tactics, motivation, development, discipline)
	if m["Overall"] != nil {
		overall = intOf(m["Overall"])
	}
	signingFee := ManagerFee(overall)
	if m["SigningFee"] != nil {
		signingFee = intOf(m["SigningFee"])
	}
	wage := ManagerWage(overall)
	if m["Wage"] != nil {
		wage = intOf(m["Wage"])
	}
	return map[string]any{
		"overall": overall, "tactics": tactics, "motivation": motivation,
		"development": development, "discipline": discipline,
		"signingFee": signingFee, "wage": wage, "contractYears": intOf(m["ContractYears"]),
	}, nil
}

func default50(v any) int {
	if v == nil {
		return 50
	}
	return intOf(v)
}

// qualifyingFriendlyRecord counts played friendlies up to the program's
// completion (play/qualifying.ts).
func (r *Repository) qualifyingFriendlyRecord(ctx context.Context, clubID string) (map[string]any, error) {
	program, _, err := r.one(ctx, `SELECT "CompletedAt" FROM "OwnerProgram" WHERE "ClubId" = $1 LIMIT 1`, clubID)
	if err != nil {
		return nil, err
	}
	args := []any{clubID}
	timeClause := ""
	if program != nil && db.StringField(program, "CompletedAt") != "" {
		timeClause = ` AND f."PlayedAt" <= $2`
		args = append(args, db.StringField(program, "CompletedAt"))
	}
	rows, err := r.q.Query(ctx, `
		SELECT
		  count(*) FILTER (WHERE
		    (f."HomeTeamId" = $1 AND (f."Details"->>'HomeTeamScore')::int > (f."Details"->>'AwayTeamScore')::int)
		    OR (f."AwayTeamId" = $1 AND (f."Details"->>'AwayTeamScore')::int > (f."Details"->>'HomeTeamScore')::int)
		  )::int AS wins,
		  count(*) FILTER (WHERE
		    (f."Details"->>'HomeTeamScore')::int = (f."Details"->>'AwayTeamScore')::int
		  )::int AS draws,
		  count(*) FILTER (WHERE
		    (f."HomeTeamId" = $1 AND (f."Details"->>'HomeTeamScore')::int < (f."Details"->>'AwayTeamScore')::int)
		    OR (f."AwayTeamId" = $1 AND (f."Details"->>'AwayTeamScore')::int < (f."Details"->>'HomeTeamScore')::int)
		  )::int AS losses
		FROM "Fixtures" f
		WHERE f."Type" = 'friendly' AND f."Played" = true
		  AND (f."HomeTeamId" = $1 OR f."AwayTeamId" = $1)`+timeClause, args...)
	if err != nil {
		return nil, err
	}
	row, ok, err := db.ScanOne(rows)
	if err != nil {
		return nil, err
	}
	if !ok {
		return map[string]any{"wins": 0, "draws": 0, "losses": 0}, nil
	}
	return map[string]any{"wins": intOf(row["wins"]), "draws": intOf(row["draws"]), "losses": intOf(row["losses"])}, nil
}

// BuildStepFacts assembles the pure facts snapshot for a club at a step.
func (r *Repository) BuildStepFacts(ctx context.Context, clubID, step string, overrides map[string]any) (map[string]any, error) {
	club, ok, err := r.one(ctx, `SELECT * FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errClubNotFound
	}
	program, err := r.Program(ctx, clubID)
	if err != nil {
		return nil, err
	}
	manager, err := r.managerFacts(ctx, clubID)
	if err != nil {
		return nil, err
	}
	squad, err := r.squadSummary(ctx, clubID)
	if err != nil {
		return nil, err
	}
	assetRows, err := r.q.Query(ctx, `SELECT "AssetType","Level","UpgradingTo" FROM "ClubAssets" WHERE "ClubId" = $1`, clubID)
	if err != nil {
		return nil, err
	}
	assets, err := db.ScanAll(assetRows)
	if err != nil {
		return nil, err
	}
	friendlies, err := r.qualifyingFriendlyRecord(ctx, clubID)
	if err != nil {
		return nil, err
	}

	scout := mapOf(program["Scout"])
	blockedAt := 0
	if scout != nil {
		blockedAt = intOf(scout["playBlockedAt"])
	}
	assetOut := make([]any, 0, len(assets))
	for _, a := range assets {
		tier := intOf(a["Level"])
		upgradingTo := any(nil)
		if a["UpgradingTo"] != nil {
			upgradingTo = intOf(a["UpgradingTo"])
		}
		assetOut = append(assetOut, map[string]any{
			"type": db.StringField(a, "AssetType"), "tier": tier, "upgradingTo": upgradingTo, "hasEffect": tier >= 1,
		})
	}

	playBlocked := blockedAt > 0 && time.Now().UnixMilli()-int64(blockedAt) < playBlockedTTLMS
	if overrides != nil {
		if v, ok := overrides["playBlocked"].(bool); ok {
			playBlocked = v
		}
	}
	sessionMinutes := 0.0
	if overrides != nil && overrides["sessionMinutes"] != nil {
		sessionMinutes = floatOf(overrides["sessionMinutes"])
	}
	stepStars := mapOf(program["StepStars"])
	if stepStars == nil {
		stepStars = map[string]any{}
	}

	startingBalance := floatOf(club["Budget"])
	if program["StartingBalance"] != nil {
		startingBalance = floatOf(program["StartingBalance"])
	}
	managersBrowsed := 0
	var interviewed, scouted any
	if scout != nil {
		if list, ok := scout["managerIdsBrowsed"].([]any); ok {
			managersBrowsed = len(list)
		}
		interviewed = stringList(scout["interviewedManagerIds"])
		scouted = stringList(scout["scoutedPlayerIds"])
	}
	if interviewed == nil {
		interviewed = []string{}
	}
	if scouted == nil {
		scouted = []string{}
	}

	return map[string]any{
		"step":            step,
		"startingBalance": startingBalance,
		"budget":          floatOf(club["Budget"]),
		"manager":         manager,
		"squad":           squad,
		"assets":          assetOut,
		"programXp":       ProgramXpFromStars(stepStars, step),
		"clubXp":          intOf(club["XP"]),
		"friendlies":      friendlies,
		"scout": map[string]any{
			"managersBrowsed": managersBrowsed, "interviewedManagerIds": interviewed, "scoutedPlayerIds": scouted,
		},
		"events": map[string]any{
			"playBlocked": playBlocked, "sessionMinutes": sessionMinutes,
			"programCompletedOnce": db.StringField(program, "Step") == "done" && program["CompletedAt"] != nil,
		},
	}, nil
}

func mapOf(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}
