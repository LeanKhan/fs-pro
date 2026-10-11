// Package world implements the world.* routes. Settings get/patch are real;
// end-year, advance-day and performance are declared stubs (the season cycle
// is not ported).
package world

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"fs-pro-server/internal/auth"
	"fs-pro-server/internal/calendar"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
	"fs-pro-server/internal/performance"
)

// Handlers implements the world.* routes.
type Handlers struct {
	repo *Repository
}

// New builds the handler set.
func New(repo *Repository) *Handlers { return &Handlers{repo: repo} }

func stub(what string) httpapi.Response {
	return httpapi.Fail(400, what+" is not available in the Go server yet", nil)
}

// getSettings is GET /api/world/settings.
func (h *Handlers) getSettings(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	s, ok, err := h.repo.Settings(r.Context())
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	if !ok {
		return httpapi.Fail(400, "No calendar row: the game world has not been set up", nil)
	}
	return httpapi.OK("World settings", s)
}

// requireAdmin mirrors Node's isAdmin/accessDenied: 401 anonymous, 403
// "You do not manage this club" for a signed-in non-admin.
func (h *Handlers) requireAdmin(cx *httpapi.Context, r *http.Request) (httpapi.Response, bool) {
	userID := ""
	if cx != nil && cx.Session != nil {
		userID = cx.Session.UserID()
	}
	if userID == "" {
		return httpapi.Fail(401, "Not logged in", nil), false
	}
	if !auth.IsAdminByID(r.Context(), h.repo.Q(), userID) {
		return httpapi.Fail(403, "You do not manage this club", nil), false
	}
	return httpapi.Response{}, true
}

// updateSettings is PATCH /api/world/settings. Admin-only (Node's handler).
func (h *Handlers) updateSettings(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireAdmin(cx, r); !ok {
		return denial
	}
	body, _ := cx.BodyMap()
	s, ok, err := h.repo.UpdateSettings(r.Context(), body)
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	if !ok {
		return httpapi.Fail(404, "No calendar row", nil)
	}
	return httpapi.OK("World settings updated", s)
}

// endYear is POST /api/world/end-year (admin): end the current year.
func (h *Handlers) endYear(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireAdmin(cx, r); !ok {
		return denial
	}
	summary, err := EndYear(r.Context(), h.repo.Q())
	if err != nil {
		return httpapi.Fail(400, err.Error(), nil)
	}
	if summary == nil {
		return httpapi.Fail(409, "The year was already ended", nil)
	}
	return httpapi.OK(fmt.Sprintf("%v ended", summary["label"]), summary)
}

// advanceDay is POST /api/world/advance-day (admin): the rest of the current day.
func (h *Handlers) advanceDay(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireAdmin(cx, r); !ok {
		return denial
	}
	result, err := calendar.NewRepository(h.repo.Q()).TickNow(r.Context())
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	report, _ := result["report"].(map[string]any)
	return httpapi.OK(fmt.Sprintf("Day %v done", result["fromDay"]), report)
}

// performance is GET /api/world/performance/{clubId} (public, like Node).
func (h *Handlers) performance(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	var year *int
	if v := r.URL.Query().Get("year"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return httpapi.Fail(400, "Invalid year", nil)
		}
		year = &n
	}
	view, err := performance.GetPerformance(r.Context(), h.repo.Q(), r.PathValue("clubId"), year)
	if err != nil {
		return httpapi.Fail(404, err.Error(), nil)
	}
	return httpapi.OK("Performance", view)
}

// settingsPatchColumns maps the contract's camelCase patch keys to DB columns.
var settingsPatchColumns = map[string]string{
	"yearLengthDays":       "YearLengthDays",
	"autoRollover":         "AutoRollover",
	"transferWindows":      "TransferWindows",
	"defaultRules":         "DefaultRules",
	"levelThresholds":      "LevelThresholds",
	"xpPerMatch":           "XPPerMatch",
	"levelTargets":         "LevelTargets",
	"levelReview":          "LevelReview",
	"maxConcurrentEntries": "MaxConcurrentEntries",
	"weekTemplate":         "WeekTemplate",
	"kickoffHours":         "KickoffHours",
	"cupKickoffHour":       "CupKickoffHour",
	"townSize":             "DistrictClubs",
	"regionTowns":          "RegionCities",
	"countryRegions":       "CountryRegions",
	"caretakerAfterDays":   "CaretakerAfterDays",
	"releaseAfterSeasons":  "ReleaseAfterSeasons",
}

// Repository reads/writes world settings on the singleton Calendars row.
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// Q exposes the querier for access checks.
func (r *Repository) Q() db.Querier { return r.q }

// Settings returns the WorldSettings view.
func (r *Repository) Settings(ctx context.Context) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Calendars" LIMIT 1`)
	if err != nil {
		return nil, false, err
	}
	cal, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return nil, false, err
	}
	return settingsView(cal), true, nil
}

// UpdateSettings applies the provided patch keys.
func (r *Repository) UpdateSettings(ctx context.Context, patch map[string]any) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `SELECT "_id","CurrentDay","YearStartDay" FROM "Calendars" LIMIT 1`)
	if err != nil {
		return nil, false, err
	}
	cal, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return nil, false, err
	}
	update := map[string]any{"updatedAt": time.Now()}
	for key, col := range settingsPatchColumns {
		if v, present := patch[key]; present {
			update[col] = v
		}
	}
	if len(update) == 1 {
		return r.Settings(ctx)
	}
	if _, err := db.UpdateRow(ctx, r.q, "Calendars", "_id", db.StringField(cal, "_id"), update, false); err != nil {
		return nil, false, err
	}
	return r.Settings(ctx)
}

func settingsView(cal map[string]any) map[string]any {
	day := intVal(cal["CurrentDay"])
	start := intVal(cal["YearStartDay"])
	return map[string]any{
		"currentDay":           day,
		"currentYear":          intVal(cal["CurrentYear"]),
		"yearStartDay":         start,
		"dayOfYear":            day - start + 1,
		"yearLengthDays":       intVal(cal["YearLengthDays"]),
		"autoRollover":         boolVal(cal["AutoRollover"]),
		"transferWindows":      orEmptyArray(cal["TransferWindows"]),
		"defaultRules":         cal["DefaultRules"],
		"levelThresholds":      cal["LevelThresholds"],
		"xpPerMatch":           cal["XPPerMatch"],
		"levelTargets":         cal["LevelTargets"],
		"levelReview":          cal["LevelReview"],
		"maxConcurrentEntries": intVal(cal["MaxConcurrentEntries"]),
		"weekTemplate":         orEmptyArray(cal["WeekTemplate"]),
		"kickoffHours":         orEmptyArray(cal["KickoffHours"]),
		"cupKickoffHour":       intVal(cal["CupKickoffHour"]),
		"townSize":             intVal(cal["DistrictClubs"]),
		"regionTowns":          intVal(cal["RegionCities"]),
		"countryRegions":       intVal(cal["CountryRegions"]),
		"caretakerAfterDays":   intVal(cal["CaretakerAfterDays"]),
		"releaseAfterSeasons":  intVal(cal["ReleaseAfterSeasons"]),
	}
}

func orEmptyArray(v any) any {
	if v == nil {
		return []any{}
	}
	return v
}

func intVal(v any) int {
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

func boolVal(v any) bool { b, _ := v.(bool); return b }
