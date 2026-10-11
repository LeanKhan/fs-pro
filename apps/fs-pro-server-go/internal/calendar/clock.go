package calendar

import (
	"context"
	"fmt"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/play"
)

// Calendar world-day pipeline, ported (reduced) from
// services/world/world-day.service.ts + calendar-clock.service.ts. The clock
// advances one hour per tick, playing each day's scheduled fixtures through the
// PlayFixture path; day start heals past unplayed fixtures. Edition ticking,
// competition AI, challenge expiry, transfer-market days and the year-end
// rollover are not ported (no-ops), documented in NOTES.

func (r *Repository) clock(ctx context.Context) (map[string]any, error) {
	row, ok, err := r.one(ctx, `SELECT * FROM "Calendars" LIMIT 1`)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("No calendar row: the game world has not been set up")
	}
	return row, nil
}

func (r *Repository) one(ctx context.Context, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

func (r *Repository) setCalendar(ctx context.Context, patch map[string]any) error {
	row, ok, err := r.one(ctx, `SELECT "_id" FROM "Calendars" LIMIT 1`)
	if err != nil || !ok {
		return err
	}
	_, err = db.UpdateRow(ctx, r.q, "Calendars", "_id", db.StringField(row, "_id"), patch, false)
	return err
}

func newReport(day, hour int) map[string]any {
	return map[string]any{
		"day": day, "hours": []any{hour, hour}, "pausedForYearEnd": false, "yearEnded": nil,
		"healed": 0, "editions": nil, "challenges": nil, "ai": nil, "transferWindowOpened": false,
		"matches": map[string]any{"total": 0, "simulated": 0, "failed": 0}, "advancedTo": nil,
	}
}

func (r *Repository) healPastUnplayedFixtures(ctx context.Context, upToDay int) (int, error) {
	rows, err := r.q.Query(ctx, `SELECT "_id" FROM "Fixtures" WHERE "Played" = false AND "ScheduledDay" IS NOT NULL AND "ScheduledDay" < $1 ORDER BY "ScheduledDay", "_id"`, upToDay)
	if err != nil {
		return 0, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return 0, err
	}
	repo := play.NewRepository(r.q)
	healed := 0
	for _, f := range list {
		if _, err := repo.PlayFixture(ctx, db.StringField(f, "_id"), true); err == nil {
			healed++
		}
	}
	return healed, nil
}

// runWorldHour runs one game hour.
func (r *Repository) runWorldHour(ctx context.Context) (map[string]any, error) {
	cal, err := r.clock(ctx)
	if err != nil {
		return nil, err
	}
	day := intOf(cal["CurrentDay"])
	hour := intOf(cal["CurrentHour"])
	if hour < 0 {
		hour = 0
	}
	if hour > 23 {
		hour = 23
	}
	report := newReport(day, hour)

	if hour == 0 {
		healed, err := r.healPastUnplayedFixtures(ctx, day)
		if err != nil {
			return nil, err
		}
		report["healed"] = healed
	}

	// Matches kicking off by this hour (and any earlier, still unplayed).
	rows, err := r.q.Query(ctx, `SELECT "_id" FROM "Fixtures"
		WHERE "ScheduledDay" = $1 AND "Played" = false AND ("KickoffHour" IS NULL OR "KickoffHour" <= $2)
		ORDER BY "KickoffHour", "_id"`, day, hour)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	repo := play.NewRepository(r.q)
	simulated, failed := 0, 0
	for _, f := range list {
		if _, err := repo.PlayFixture(ctx, db.StringField(f, "_id"), true); err != nil {
			failed++
		} else {
			simulated++
		}
	}
	report["matches"] = map[string]any{"total": len(list), "simulated": simulated, "failed": failed}

	if hour >= 23 {
		if _, err := r.advanceIdleDay(ctx); err != nil {
			return nil, err
		}
		if err := r.setCalendar(ctx, map[string]any{"CurrentHour": 0, "updatedAt": time.Now()}); err != nil {
			return nil, err
		}
		after, err := r.clock(ctx)
		if err != nil {
			return nil, err
		}
		report["advancedTo"] = intOf(after["CurrentDay"])
	} else {
		if err := r.setCalendar(ctx, map[string]any{"CurrentHour": hour + 1, "updatedAt": time.Now()}); err != nil {
			return nil, err
		}
	}
	return report, nil
}

// runWorldDay runs the rest of the current day, hour by hour.
func (r *Repository) runWorldDay(ctx context.Context) (map[string]any, error) {
	total, err := r.runWorldHour(ctx)
	if err != nil {
		return nil, err
	}
	for total["advancedTo"] == nil {
		next, err := r.runWorldHour(ctx)
		if err != nil {
			return nil, err
		}
		total["hours"] = []any{intOf(toPair(total["hours"])[0]), intOf(toPair(next["hours"])[1])}
		m := total["matches"].(map[string]any)
		n := next["matches"].(map[string]any)
		m["total"] = intOf(m["total"]) + intOf(n["total"])
		m["simulated"] = intOf(m["simulated"]) + intOf(n["simulated"])
		m["failed"] = intOf(m["failed"]) + intOf(n["failed"])
		total["advancedTo"] = next["advancedTo"]
		total["pausedForYearEnd"] = next["pausedForYearEnd"]
	}
	return total, nil
}

func toPair(v any) []any {
	p, _ := v.([]any)
	if len(p) < 2 {
		return []any{0, 0}
	}
	return p
}

// advanceIdleDay moves the calendar forward one game day.
func (r *Repository) advanceIdleDay(ctx context.Context) (map[string]any, error) {
	cal, err := r.clock(ctx)
	if err != nil {
		return nil, err
	}
	toDay := intOf(cal["CurrentDay"]) + 1
	toDate := addDay(db.StringField(cal, "CurrentDate"))
	if err := r.setCalendar(ctx, map[string]any{"CurrentDay": toDay, "CurrentDate": toDate, "updatedAt": time.Now()}); err != nil {
		return nil, err
	}
	return r.clock(ctx)
}

func addDay(dateStr string) time.Time {
	t, err := time.Parse("2006-01-02T15:04:05.000Z", dateStr)
	if err != nil {
		if t2, err2 := time.Parse(time.RFC3339, dateStr); err2 == nil {
			t = t2
		} else {
			t = time.Now()
		}
	}
	return t.Add(24 * time.Hour)
}

// TickNow is the admin "advance now": plays out the rest of the day.
func (r *Repository) TickNow(ctx context.Context) (map[string]any, error) {
	before, err := r.clock(ctx)
	if err != nil {
		return nil, err
	}
	fromDay := intOf(before["CurrentDay"])
	report, err := r.runWorldDay(ctx)
	if err != nil {
		return nil, err
	}
	after, err := r.clock(ctx)
	if err != nil {
		return nil, err
	}
	m := report["matches"].(map[string]any)
	return map[string]any{
		"ran": true, "report": report, "fromDay": fromDay, "toDay": intOf(after["CurrentDay"]),
		"simulatedFixtures": intOf(m["simulated"]), "nextTickAt": nil,
	}, nil
}

// HealCalendar is calendar.healCalendar.
func (r *Repository) HealCalendar(ctx context.Context) (map[string]any, error) {
	cal, err := r.clock(ctx)
	if err != nil {
		return nil, err
	}
	healed, err := r.healPastUnplayedFixtures(ctx, intOf(cal["CurrentDay"]))
	if err != nil {
		return nil, err
	}
	return map[string]any{"healedCount": healed, "currentDay": intOf(cal["CurrentDay"])}, nil
}

// SimulateToDate is calendar.simulateToDate.
func (r *Repository) SimulateToDate(ctx context.Context, targetDay int, includeTargetDay bool) (map[string]any, error) {
	start, err := r.clock(ctx)
	if err != nil {
		return nil, err
	}
	lastDay := targetDay
	if !includeTargetDay {
		lastDay = targetDay - 1
	}
	simulatedFixtures, failedFixtures, days := 0, 0, 0
	for days < 365 {
		cur, err := r.clock(ctx)
		if err != nil {
			return nil, err
		}
		if intOf(cur["CurrentDay"]) > lastDay {
			break
		}
		rep, err := r.runWorldDay(ctx)
		if err != nil {
			return nil, err
		}
		if paused, _ := rep["pausedForYearEnd"].(bool); paused {
			break
		}
		m := rep["matches"].(map[string]any)
		simulatedFixtures += intOf(m["simulated"])
		failedFixtures += intOf(m["failed"])
		days++
	}
	end, err := r.clock(ctx)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"startDay": intOf(start["CurrentDay"]), "currentDay": intOf(end["CurrentDay"]),
		"currentDate": end["CurrentDate"], "simulatedFixtures": simulatedFixtures,
		"failedFixtures": failedFixtures, "simulatedDays": days,
	}, nil
}
