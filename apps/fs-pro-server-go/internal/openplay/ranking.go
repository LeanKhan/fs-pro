package openplay

import "math"

// Pure ranking maths, ported from
// apps/fs-pro-server/src/services/competitions/ranking.ts and the scheduler
// helpers in packages/api-contract/src/world-calendar.ts.

// RankingRow is a club's table row for one stage/group.
type RankingRow struct {
	ClubId          string
	Group           any
	Played          int
	Wins            int
	Draws           int
	Losses          int
	GF              int
	GA              int
	GD              int
	Points          int
	CleanSheets     int
	Forfeits        int
	UnbeatenRun     int
	BestUnbeatenRun int
	EloStart        float64
}

const forfeitGoals = 3
const defaultEloK = 24.0

// applyMatchToRow folds one result into a row (ranking.ts applyMatchToRow).
func applyMatchToRow(row RankingRow, goalsFor, goalsAgainst int, rules LeagueRules, forfeited bool) RankingRow {
	won := goalsFor > goalsAgainst
	drew := goalsFor == goalsAgainst
	unbeaten := 0
	if won || drew {
		unbeaten = row.UnbeatenRun + 1
	}
	next := row
	next.Played++
	if won {
		next.Wins++
	}
	if drew {
		next.Draws++
	}
	if !won && !drew {
		next.Losses++
	}
	next.GF += goalsFor
	next.GA += goalsAgainst
	next.GD += goalsFor - goalsAgainst
	if won {
		next.Points += rules.PointsForWin
	} else if drew {
		next.Points += rules.PointsForDraw
	}
	if goalsAgainst == 0 {
		next.CleanSheets++
	}
	if forfeited {
		next.Forfeits++
	}
	next.UnbeatenRun = unbeaten
	if unbeaten > next.BestUnbeatenRun {
		next.BestUnbeatenRun = unbeaten
	}
	return next
}

// eloAfter returns both sides' new Elo for the home side's result score.
func eloAfter(homeElo, awayElo, score, k float64) (float64, float64) {
	expectedHome := 1.0 / (1.0 + math.Pow(10, (awayElo-homeElo)/400.0))
	delta := k * (score - expectedHome)
	return homeElo + delta, awayElo - delta
}

// reachedTarget reports whether a first-to win condition is met.
func reachedTarget(row RankingRow, metric string, target int) bool {
	switch metric {
	case "points":
		return row.Points >= target
	case "wins":
		return row.Wins >= target
	case "gf":
		return row.GF >= target
	}
	return false
}

// dayKind ports world-calendar.ts dayKind: the week template decides whether a
// day is a league ('L') or cup ('C') day.
func dayKind(cal map[string]any, day int) string {
	template := []string{"L", "C", "L", "L", "C", "L", "L"}
	if t := stringSliceOf(cal["WeekTemplate"]); len(t) > 0 {
		template = t
	}
	start := intVal(cal["YearStartDay"])
	n := len(template)
	i := ((day-start)%n + n) % n
	return template[i]
}
