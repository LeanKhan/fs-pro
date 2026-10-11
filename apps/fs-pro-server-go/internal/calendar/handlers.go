package calendar

import (
	"fmt"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
)

// Handlers implements the calendar.* routes.
type Handlers struct {
	repo *Repository
}

// New builds the handler set.
func New(repo *Repository) *Handlers { return &Handlers{repo: repo} }

func body(cx *httpapi.Context) map[string]any {
	m, _ := cx.BodyMap()
	if m == nil {
		return map[string]any{}
	}
	return m
}

func str(m map[string]any, key string) string {
	s, _ := m[key].(string)
	return s
}

func intOf(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int8:
		return int(n)
	case int16:
		return int(n)
	case int32:
		return int(n)
	case int64:
		return int(n)
	case float32:
		return int(n)
	case float64:
		return int(n)
	default:
		return 0
	}
}

// getCurrentCalendar is GET /api/calendar/current.
func (h *Handlers) getCurrentCalendar(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	cal, err := h.repo.Calendar(r.Context())
	if err != nil {
		return httpapi.Fail(400, "Error fetching current Calendar", err.Error())
	}
	return httpapi.OK("Fetched current Calendar successfully! :)", cal)
}

// getSeasonReports is GET /api/calendar/season-reports.
func (h *Handlers) getSeasonReports(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	reports, err := h.repo.SeasonReports(r.Context())
	if err != nil {
		return httpapi.Fail(400, "Error fetching season reports", err.Error())
	}
	return httpapi.OK("Season reports fetched successfully", reports)
}

// getSeasonReport is GET /api/calendar/season-reports/{year}.
func (h *Handlers) getSeasonReport(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	year := strings.ToUpper(strings.TrimSpace(r.PathValue("year")))
	report, ok, err := h.repo.SeasonReport(r.Context(), year)
	if err != nil {
		return httpapi.Fail(400, "Error fetching season report", err.Error())
	}
	if !ok {
		return httpapi.Fail(404, "No report for that season cycle", nil)
	}
	return httpapi.OK("Season report fetched successfully", report)
}

// getWorldFeed is GET /api/calendar/world-feed. The Node world-feed service is
// large; this port returns a shape-valid, calendar-backed empty feed
// (documented in NOTES.md).
func (h *Handlers) getWorldFeed(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	cal, err := h.repo.Calendar(r.Context())
	if err != nil {
		return httpapi.Fail(400, "Error fetching world feed", err.Error())
	}
	feed := map[string]any{
		"currentDay":     intOf(cal["CurrentDay"]),
		"currentDate":    cal["CurrentDate"],
		"recentResults":  []any{},
		"headlines":      []any{},
		"otherLeagues":   []any{},
		"activeInjuries": []any{},
	}
	return httpapi.OK("World feed fetched successfully", feed)
}

// getDays is GET /api/calendar/days.
func (h *Handlers) getDays(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	q := r.URL.Query()
	from := 0
	if v := q.Get("from"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			from = n
		}
	}
	to := from
	if v := q.Get("to"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			to = n
		}
	}
	days, err := h.repo.DaysInRange(r.Context(), from, to)
	if err != nil {
		return httpapi.Fail(400, "Error fetching Calendar events", err.Error())
	}
	return httpapi.OK("Calendar events fetched successfully!", days)
}

// deleteDay is DELETE /api/calendar/days/{id}.
func (h *Handlers) deleteDay(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	id := r.PathValue("id")
	day, ok, err := h.repo.DeleteDay(r.Context(), id)
	if err != nil {
		return httpapi.Fail(400, "Error deleting Calendar Day", err.Error())
	}
	if !ok {
		return httpapi.Fail(400, "Error deleting Calendar Day", "Day ["+id+"] does not exist")
	}
	return httpapi.OK("Calendar Day deleted successfully :)", day)
}

// getClock is GET /api/calendar/clock.
func (h *Handlers) getClock(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	cal, err := h.repo.Calendar(r.Context())
	if err != nil {
		return httpapi.Fail(400, "Error reading clock", err.Error())
	}
	return httpapi.OK("Clock state", clockState(cal))
}

// setClock is POST /api/calendar/clock (fully implemented).
func (h *Handlers) setClock(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	cal, err := h.repo.Calendar(ctx)
	if err != nil {
		return httpapi.Fail(400, "Error updating clock", err.Error())
	}
	data := body(cx)
	dayLength := intOf(cal["DayLengthMinutes"])
	if dayLength == 0 {
		dayLength = 1440
	}
	patch := map[string]any{}
	if v, ok := data["dayLengthMinutes"]; ok {
		d := clamp(int(math.Round(asFloat(v))), 24, 60*24*14)
		patch["DayLengthMinutes"] = d
		dayLength = d
	}
	if mode := str(data, "mode"); mode == "live" || mode == "paused" {
		patch["ClockMode"] = mode
		if mode == "live" && db.StringField(cal, "ClockMode") != "live" {
			patch["NextTickAt"] = nextBoundary(time.Now(), dayLength)
		}
		if mode == "paused" {
			patch["NextTickAt"] = nil
		}
	}
	if len(patch) > 0 {
		updated, uerr := h.repo.UpdateCalendar(ctx, db.StringField(cal, "_id"), patch)
		if uerr != nil {
			return httpapi.Fail(400, "Error updating clock", uerr.Error())
		}
		cal = updated
	}
	state := clockState(cal)
	return httpapi.OK("Clock "+state["mode"].(string), state)
}

// tickClock is POST /api/calendar/clock/tick (advance now).
func (h *Handlers) tickClock(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	result, err := h.repo.TickNow(r.Context())
	if err != nil {
		return httpapi.Fail(400, "Error running tick", err.Error())
	}
	return httpapi.OK(fmt.Sprintf("Advanced day %d -> %d", intOf(result["fromDay"]), intOf(result["toDay"])), result)
}

// healCalendar is POST /api/calendar/heal.
func (h *Handlers) healCalendar(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	result, err := h.repo.HealCalendar(r.Context())
	if err != nil {
		return httpapi.Fail(400, "Error healing calendar", err.Error())
	}
	return httpapi.OK(fmt.Sprintf("Calendar healed successfully! Auto-resolved %d unplayed fixtures.", intOf(result["healedCount"])), result)
}

// simulateToDate is POST /api/calendar/simulate-to-date.
func (h *Handlers) simulateToDate(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	b := body(cx)
	cal, err := h.repo.clock(r.Context())
	if err != nil {
		return httpapi.Fail(400, "Error simulating to target date", err.Error())
	}
	targetDay := intOf(cal["CurrentDay"])
	if b["targetDay"] != nil {
		targetDay = intOf(b["targetDay"])
	} else if ts, _ := b["targetDate"].(string); ts != "" {
		if t, err := time.Parse(time.RFC3339, ts); err == nil {
			if cur, err := time.Parse("2006-01-02T15:04:05.000Z", db.StringField(cal, "CurrentDate")); err == nil {
				targetDay = intOf(cal["CurrentDay"]) + int(math.Round(t.Sub(cur).Hours()/24))
			}
		}
	}
	includeTarget := true
	if v, ok := b["includeTargetDay"].(bool); ok {
		includeTarget = v
	}
	result, err := h.repo.SimulateToDate(r.Context(), targetDay, includeTarget)
	if err != nil {
		return httpapi.Fail(400, "Error simulating to target date", err.Error())
	}
	return httpapi.OK(fmt.Sprintf("Simulation complete! Simulated %d match(es) across %d day(s).", intOf(result["simulatedFixtures"]), intOf(result["simulatedDays"])), result)
}

// --- clock helpers ---------------------------------------------------------

func clockState(cal map[string]any) map[string]any {
	mode := db.StringField(cal, "ClockMode")
	if mode != "live" {
		mode = "paused"
	}
	dayLength := intOf(cal["DayLengthMinutes"])
	if dayLength == 0 {
		dayLength = 1440
	}
	return map[string]any{
		"mode":             mode,
		"currentDay":       intOf(cal["CurrentDay"]),
		"currentDate":      cal["CurrentDate"],
		"nextTickAt":       cal["NextTickAt"],
		"lastTickAt":       cal["LastTickAt"],
		"currentHour":      intOf(cal["CurrentHour"]),
		"dayLengthMinutes": dayLength,
		"dayKind":          dayKind(cal),
	}
}

func dayKind(cal map[string]any) string {
	template := weekTemplate(cal["WeekTemplate"])
	start := intOf(cal["YearStartDay"])
	day := intOf(cal["CurrentDay"])
	if len(template) == 0 {
		return "L"
	}
	idx := ((day-start)%len(template) + len(template)) % len(template)
	if template[idx] == "C" {
		return "C"
	}
	return "L"
}

func weekTemplate(v any) []string {
	list, ok := v.([]any)
	if !ok {
		return []string{"L", "C", "L", "L", "C", "L", "L"}
	}
	out := make([]string, 0, len(list))
	for _, item := range list {
		s, _ := item.(string)
		out = append(out, s)
	}
	if len(out) == 0 {
		return []string{"L", "C", "L", "L", "C", "L", "L"}
	}
	return out
}

func asFloat(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case int64:
		return float64(n)
	case string:
		f, _ := strconv.ParseFloat(n, 64)
		return f
	default:
		return 0
	}
}

func clamp(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

// hourMs mirrors calendar-clock.service.ts's hourMs (scaled by GAME_TIME_SCALE).
func hourMs(dayLengthMinutes int) float64 {
	scale := 1.0
	if v := strings.TrimSpace(os.Getenv("GAME_TIME_SCALE")); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
			scale = f
		}
	}
	if scale < 0.01 {
		scale = 0.01
	}
	ms := float64(dayLengthMinutes) * 60_000 / 24 / scale
	if ms < 1000 {
		return 1000
	}
	return ms
}

// nextBoundary is the next whole hour boundary after from (epoch-aligned).
func nextBoundary(from time.Time, dayLengthMinutes int) time.Time {
	h := hourMs(dayLengthMinutes)
	ms := float64(from.UnixMilli())
	return time.UnixMilli(int64(math.Floor(ms/h)*h + h))
}
