package world

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"fs-pro-server/internal/calendar"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/performance"
)

// EndYear ports services/world/year.service.ts endYear: claim the year (CAS on
// CurrentYear), heal the last day's fixtures, close/freeze the year's
// performance, and write the season report. The pyramid finish/draw
// (promotion/relegation + next-season fixtures), player progression/wages/
// retirement/youth intake, free-agent expiry, caretaker release and the Level
// review are NOT ported - the summary reports zeros for those; documented in
// NOTES.

// EndYear ends the current year and returns the YearEndSummary, or nil when the
// year was already claimed (or started today).
func EndYear(ctx context.Context, q db.Querier) (map[string]any, error) {
	rows, err := q.Query(ctx, `SELECT * FROM "Calendars" LIMIT 1`)
	if err != nil {
		return nil, err
	}
	cal, ok, err := db.ScanOne(rows)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("No calendar row: the game world has not been set up")
	}
	year := intVal(cal["CurrentYear"])
	today := intVal(cal["CurrentDay"])
	fromDay := intVal(cal["YearStartDay"])
	toDay := today - 1
	if today <= fromDay {
		return nil, nil
	}
	tag, err := q.Exec(ctx, `UPDATE "Calendars" SET "CurrentYear" = $2, "YearStartDay" = $3, "updatedAt" = now() WHERE "_id" = $1 AND "CurrentYear" = $4`,
		db.StringField(cal, "_id"), year+1, today, year)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, nil
	}

	label := fmt.Sprintf("Y%d", year)
	errors := []string{}

	// The year's last league fixtures first, so the tables are final.
	if _, err := calendar.NewRepository(q).HealCalendar(ctx); err != nil {
		errors = append(errors, "last fixtures: "+err.Error())
	}
	moves, err := performance.CloseYear(ctx, q, year, fromDay, toDay)
	if err != nil {
		errors = append(errors, "performance and Level review: "+err.Error())
	}
	if err := writeSeasonReport(ctx, q, label, fromDay, toDay); err != nil {
		errors = append(errors, "year report: "+err.Error())
	}

	return map[string]any{
		"year": year, "label": label, "fromDay": fromDay, "toDay": toDay,
		"retired":          0,
		"levelReviewMoves": moves,
		"pyramids":         map[string]any{"finished": 0, "drawn": 0, "promoted": 0, "relegated": 0},
		"released":         0,
		"errors":           errors,
	}, nil
}

func writeSeasonReport(ctx context.Context, q db.Querier, label string, fromDay, toDay int) error {
	data, _ := json.Marshal(map[string]any{"year": label, "fromDay": fromDay, "toDay": toDay, "generatedAt": time.Now().UTC().Format(time.RFC3339)})
	_, err := q.Exec(ctx, `INSERT INTO "SeasonReports" ("Year","Data","FromDay","ToDay","updatedAt") VALUES ($1,$2::jsonb,$3,$4,now())
		ON CONFLICT ("Year") DO UPDATE SET "Data" = EXCLUDED."Data", "FromDay" = EXCLUDED."FromDay", "ToDay" = EXCLUDED."ToDay", "updatedAt" = now()`,
		label, string(data), fromDay, toDay)
	return err
}
