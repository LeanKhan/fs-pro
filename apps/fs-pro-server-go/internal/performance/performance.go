// Package performance ports services/world/performance.service.ts: the board's
// yearly view of a club (finish scores, Elo/Level deltas, trophies). It backs
// world.performance, clubs.getClubPerformance and the board budget request.
package performance

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"fs-pro-server/internal/db"
)

const (
	eloTermCap = 0.1
)

func clamp(x, lo, hi float64) float64 { return math.Min(hi, math.Max(lo, x)) }
func round3(x float64) float64        { return math.Round(x*1000) / 1000 }

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

func floatOf(v any) float64 {
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

// DefaultLevelTargets ports defaultLevelTargets(topLevel=20).
func DefaultLevelTargets() []float64 {
	out := make([]float64, 21)
	for n := 0; n <= 20; n++ {
		out[n] = math.Round((0.4+(0.3*float64(n))/20)*100) / 100
	}
	return out
}

// LevelForXp ports services/world/level.ts levelForXp.
func LevelForXp(xp int, thresholds []any) int {
	th := make([]int, len(thresholds))
	for i, v := range thresholds {
		th[i] = intOf(v)
	}
	xpFor := func(level int) int {
		n := level
		if n < 0 {
			n = 0
		}
		if n < len(th) {
			return th[n]
		}
		return 100 * n * n
	}
	value := xp
	if value < 0 {
		value = 0
	}
	level := 0
	for xpFor(level+1) <= value {
		level++
	}
	return level
}

// ExpectedScore ports expectedScore.
func ExpectedScore(level int, calendar map[string]any) float64 {
	targets := toFloatList(calendar["LevelTargets"])
	if len(targets) == 0 {
		targets = DefaultLevelTargets()
	}
	idx := level
	if idx >= len(targets) {
		idx = len(targets) - 1
	}
	if idx < 0 {
		idx = 0
	}
	return targets[idx]
}

// PositionScore ports positionScore.
func PositionScore(position, entrants int, ranked bool) float64 {
	if !ranked {
		return 0
	}
	if entrants <= 1 {
		return 1
	}
	return round3(1 - float64(position-1)/float64(entrants-1))
}

// KnockoutScore ports knockoutScore.
func KnockoutScore(lostInRound *int, totalRounds int) float64 {
	if totalRounds <= 0 {
		return 0
	}
	if lostInRound == nil {
		return 1
	}
	return round3(float64(*lostInRound-1) / float64(totalRounds))
}

func toFloatList(v any) []float64 {
	list, ok := v.([]any)
	if !ok {
		if ss, ok := v.([]float64); ok {
			return ss
		}
		return nil
	}
	out := make([]float64, 0, len(list))
	for _, item := range list {
		out = append(out, floatOf(item))
	}
	return out
}

func calendarAt(ctx context.Context, q db.Querier) (map[string]any, error) {
	rows, err := q.Query(ctx, `SELECT * FROM "Calendars" LIMIT 1`)
	if err != nil {
		return nil, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New("No calendar row: the game world has not been set up")
	}
	return m, nil
}

// EnsureYearRows ports ensureYearRows: one ClubPerformance row per club for
// the current year, seeded with their Elo and Level.
func EnsureYearRows(ctx context.Context, q db.Querier, calendar map[string]any) error {
	year := intOf(calendar["CurrentYear"])
	rows, err := q.Query(ctx, `SELECT c."_id", c."Elo", c."XP" FROM "Clubs" c
		WHERE NOT EXISTS (SELECT 1 FROM "ClubPerformance" p WHERE p."ClubId" = c."_id" AND p."Year" = $1)`, year)
	if err != nil {
		return err
	}
	missing, err := db.ScanAll(rows)
	if err != nil {
		return err
	}
	thresholds := asAnyList(calendar["LevelThresholds"])
	for _, club := range missing {
		elo := floatOf(club["Elo"])
		level := LevelForXp(intOf(club["XP"]), thresholds)
		if _, err := db.InsertRow(ctx, q, "ClubPerformance", map[string]any{
			"ClubId": db.StringField(club, "_id"), "Year": year,
			"EloStart": elo, "EloEnd": elo, "LevelStart": level, "LevelEnd": level, "updatedAt": time.Now(),
		}); err != nil {
			return err
		}
	}
	return nil
}

func asAnyList(v any) []any {
	list, ok := v.([]any)
	if !ok {
		return nil
	}
	return list
}

// Span is an optional year window for refreshPerformance.
type Span struct {
	Year    int
	FromDay int
	ToDay   int
}

// RefreshPerformance ports refreshPerformance: recompute the (unfrozen) score
// rows for the given clubs, or all clubs when clubIDs is nil.
func RefreshPerformance(ctx context.Context, q db.Querier, clubIDs []string, span *Span) error {
	cal, err := calendarAt(ctx, q)
	if err != nil {
		return err
	}
	year := intOf(cal["CurrentYear"])
	fromDay := intOf(cal["YearStartDay"])
	toDay := intOf(cal["CurrentDay"])
	if span != nil {
		year, fromDay, toDay = span.Year, span.FromDay, span.ToDay
	}
	if year == intOf(cal["CurrentYear"]) {
		if err := EnsureYearRows(ctx, q, cal); err != nil {
			return err
		}
	}

	finishSQL := `SELECT e."ClubId", e."FinishScore", s."Definition", s."WinnerId"
		FROM "Entries" e JOIN "Seasons" s ON s."_id" = e."SeasonId"
		WHERE s."Status" = 'finished' AND s."EndDay" BETWEEN $1 AND $2 AND e."FinishScore" IS NOT NULL`
	args := []any{fromDay, toDay}
	if clubIDs != nil {
		args = append(args, clubIDs)
		finishSQL += ` AND e."ClubId" = ANY($3)`
	}
	finishRows, err := q.Query(ctx, finishSQL, args...)
	if err != nil {
		return err
	}
	finished, err := db.ScanAll(finishRows)
	if err != nil {
		return err
	}

	perfSQL := `SELECT p.*, c."Elo" AS "clubElo", c."XP" AS "clubXP" FROM "ClubPerformance" p
		JOIN "Clubs" c ON c."_id" = p."ClubId" WHERE p."Year" = $1 AND p."Frozen" = false`
	pargs := []any{year}
	if clubIDs != nil {
		pargs = append(pargs, clubIDs)
		perfSQL += ` AND p."ClubId" = ANY($2)`
	}
	perfRows, err := q.Query(ctx, perfSQL, pargs...)
	if err != nil {
		return err
	}
	perfs, err := db.ScanAll(perfRows)
	if err != nil {
		return err
	}
	thresholds := asAnyList(cal["LevelThresholds"])
	for _, perf := range perfs {
		clubID := db.StringField(perf, "ClubId")
		mine := []map[string]any{}
		for _, f := range finished {
			if db.StringField(f, "ClubId") == clubID {
				mine = append(mine, f)
			}
		}
		totalWeight := 0.0
		for _, f := range mine {
			totalWeight += prestigeOf(f)
		}
		trophies := 0
		for _, f := range mine {
			if db.StringField(f, "WinnerId") == clubID {
				trophies++
			}
		}
		elo := floatOf(perf["clubElo"])
		eloStart := floatOf(perf["EloStart"])
		score := 0.0
		if len(mine) > 0 {
			sum := 0.0
			for _, f := range mine {
				sum += prestigeOf(f) * floatOf(f["FinishScore"])
			}
			score = round3(sum/totalWeight + clamp((elo-eloStart)/400, -eloTermCap, eloTermCap) + 0.05*float64(trophies))
		}
		if _, err := q.Exec(ctx, `UPDATE "ClubPerformance" SET "Score"=$2, "Entries"=$3, "Trophies"=$4,
			"EloEnd"=$5, "LevelEnd"=$6, "updatedAt"=now() WHERE "_id"=$1`,
			db.StringField(perf, "_id"), score, len(mine), trophies, elo, LevelForXp(intOf(perf["clubXP"]), thresholds)); err != nil {
			return err
		}
	}
	return nil
}

func prestigeOf(f map[string]any) float64 {
	def, _ := f["Definition"].(map[string]any)
	if def == nil {
		return 2
	}
	if def["Prestige"] != nil {
		return floatOf(def["Prestige"])
	}
	return 2
}

// CloseYear ports performance.service.closeYear's performance half: recompute
// the year's scores over its span, then freeze them. The optional Level review
// is not ported (returns 0 moves), documented in NOTES.
func CloseYear(ctx context.Context, q db.Querier, year, fromDay, toDay int) (int, error) {
	if err := RefreshPerformance(ctx, q, nil, &Span{Year: year, FromDay: fromDay, ToDay: toDay}); err != nil {
		return 0, err
	}
	if _, err := q.Exec(ctx, `UPDATE "ClubPerformance" SET "Frozen" = true, "updatedAt" = now() WHERE "Year" = $1`, year); err != nil {
		return 0, err
	}
	return 0, nil
}

// GetPerformance ports getPerformance. year nil = the current year.
func GetPerformance(ctx context.Context, q db.Querier, clubID string, year *int) (map[string]any, error) {
	cal, err := calendarAt(ctx, q)
	if err != nil {
		return nil, err
	}
	target := intOf(cal["CurrentYear"])
	if year != nil {
		target = *year
	}
	if target == intOf(cal["CurrentYear"]) {
		if err := RefreshPerformance(ctx, q, []string{clubID}, nil); err != nil {
			return nil, err
		}
	}

	rowRows, err := q.Query(ctx, `SELECT * FROM "ClubPerformance" WHERE "ClubId"=$1 AND "Year"=$2 LIMIT 1`, clubID, target)
	if err != nil {
		return nil, err
	}
	row, ok, err := db.ScanOne(rowRows)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("No performance for this club in year %d", target)
	}

	fromDay := intOf(cal["YearStartDay"])
	toDay := intOf(cal["CurrentDay"])
	if target != intOf(cal["CurrentYear"]) {
		spanRows, err := q.Query(ctx, `SELECT "FromDay","ToDay" FROM "SeasonReports" WHERE "Year" = $1 LIMIT 1`, fmt.Sprintf("Y%d", target))
		if err != nil {
			return nil, err
		}
		span, ok, err := db.ScanOne(spanRows)
		if err != nil {
			return nil, err
		}
		if ok {
			fromDay = intOf(span["FromDay"])
			toDay = intOf(span["ToDay"])
		} else {
			fromDay, toDay = 0, 0
		}
	}

	finishRows, err := q.Query(ctx, `SELECT e.*, s."SeasonCode", s."Definition", s."EndDay", s."WinnerId", comp."Name" AS "competitionName"
		FROM "Entries" e
		JOIN "Seasons" s ON s."_id" = e."SeasonId"
		JOIN "Competitions" comp ON comp."_id" = s."CompetitionId"
		WHERE e."ClubId"=$1 AND s."Status"='finished' AND s."EndDay" BETWEEN $2 AND $3
		ORDER BY s."EndDay" DESC`, clubID, fromDay, toDay)
	if err != nil {
		return nil, err
	}
	finishes, err := db.ScanAll(finishRows)
	if err != nil {
		return nil, err
	}
	moveRows, err := q.Query(ctx, `SELECT * FROM "LevelHistory" WHERE "ClubId"=$1 AND "Day" BETWEEN $2 AND $3 ORDER BY "Day"`, clubID, fromDay, toDay)
	if err != nil {
		return nil, err
	}
	moves, err := db.ScanAll(moveRows)
	if err != nil {
		return nil, err
	}

	level := intOf(row["LevelEnd"])
	score := floatOf(row["Score"])
	expected := ExpectedScore(level, cal)

	finishOut := make([]any, 0, len(finishes))
	for _, f := range finishes {
		finishOut = append(finishOut, map[string]any{
			"seasonId":        db.StringField(f, "SeasonId"),
			"competitionName": db.StringField(f, "competitionName"),
			"editionCode":     db.StringField(f, "SeasonCode"),
			"finalPosition":   f["FinalPosition"],
			"finishScore":     f["FinishScore"],
			"prestige":        prestigeOf(f),
			"endDay":          f["EndDay"],
			"won":             db.StringField(f, "WinnerId") == clubID,
		})
	}
	moveOut := make([]any, 0, len(moves))
	for _, m := range moves {
		moveOut = append(moveOut, map[string]any{
			"day": intOf(m["Day"]), "from": intOf(m["FromLevel"]), "to": intOf(m["ToLevel"]), "source": db.StringField(m, "Source"),
		})
	}

	return map[string]any{
		"clubId":     clubID,
		"year":       target,
		"current":    target == intOf(cal["CurrentYear"]),
		"level":      level,
		"score":      score,
		"expected":   expected,
		"gap":        round3(score - expected),
		"entries":    intOf(row["Entries"]),
		"trophies":   intOf(row["Trophies"]),
		"eloStart":   floatOf(row["EloStart"]),
		"eloEnd":     floatOf(row["EloEnd"]),
		"levelStart": intOf(row["LevelStart"]),
		"levelEnd":   intOf(row["LevelEnd"]),
		"finishes":   finishOut,
		"levelMoves": moveOut,
	}, nil
}
