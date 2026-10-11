package calendar

import (
	"encoding/json"
	"testing"
	"time"
)

func TestDayKindUsesWeekTemplate(t *testing.T) {
	cal := map[string]any{
		"WeekTemplate": []any{"L", "C", "L", "L", "C", "L", "L"},
		"YearStartDay": 0,
		"CurrentDay":   1,
	}
	if got := dayKind(cal); got != "C" {
		t.Fatalf("dayKind day1 = %q, want C", got)
	}
	cal["CurrentDay"] = 0
	if got := dayKind(cal); got != "L" {
		t.Fatalf("dayKind day0 = %q, want L", got)
	}
	cal["CurrentDay"] = 8 // wraps
	if got := dayKind(cal); got != "C" {
		t.Fatalf("dayKind wrap = %q, want C", got)
	}
	// Missing template falls back to the default week.
	if got := dayKind(map[string]any{"CurrentDay": 1}); got != "C" {
		t.Fatalf("default template dayKind = %q", got)
	}
}

func TestClockStateShape(t *testing.T) {
	cal := map[string]any{
		"ClockMode":        "live",
		"CurrentDay":       3,
		"CurrentDate":      "2026-01-02T00:00:00.000Z",
		"NextTickAt":       nil,
		"LastTickAt":       "2026-01-01T00:00:00.000Z",
		"CurrentHour":      5,
		"DayLengthMinutes": 1440,
		"WeekTemplate":     []any{"L", "C", "L", "L", "C", "L", "L"},
		"YearStartDay":     0,
	}
	state := clockState(cal)
	if state["mode"] != "live" || state["currentHour"] != 5 || state["dayKind"] != "L" {
		t.Fatalf("clockState = %v", state)
	}
	if state["nextTickAt"] != nil {
		t.Fatalf("nextTickAt = %v, want nil", state["nextTickAt"])
	}
	raw, err := json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) == "" {
		t.Fatal("state must marshal")
	}
}

func TestNextBoundaryIsAWholeHourAhead(t *testing.T) {
	from := time.UnixMilli(0).Add(30 * time.Minute) // 00:30
	next := nextBoundary(from, 1440)                // 1 game hour = 1 real hour
	if next.Sub(time.UnixMilli(0)) != time.Hour {
		t.Fatalf("nextBoundary = %s", next)
	}
}

func TestClamp(t *testing.T) {
	if clamp(5, 24, 100) != 24 || clamp(500, 24, 100) != 100 || clamp(50, 24, 100) != 50 {
		t.Fatal("clamp failed")
	}
}
