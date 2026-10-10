package play

import (
	"net/http"
	"strings"
	"testing"

	"fs-pro-server/internal/config"
	"fs-pro-server/internal/httpapi"
)

// TestRegisterIncludesScoutRoute pins the id/method/path/statuses of the scout
// route the orchestrator's main.go wiring relies on, and confirms the 11
// existing play routes are untouched.
func TestRegisterIncludesScoutRoute(t *testing.T) {
	srv := httpapi.New(httpapi.Deps{Config: config.Config{LogLevel: "error", RateLimitOff: true}})
	Register(srv, New(NewRepository(nil)))

	seen := map[string]httpapi.RouteInfo{}
	playCount := 0
	for _, r := range srv.Routes() {
		seen[r.ID] = r
		if strings.HasPrefix(r.ID, "play.") {
			playCount++
		}
	}
	if playCount != 12 {
		t.Fatalf("registered %d play routes, want 12", playCount)
	}
	scout, ok := seen["play.scoutOpponent"]
	if !ok {
		t.Fatal("play.scoutOpponent is not registered")
	}
	if scout.Method != http.MethodPost || scout.Path != "/api/play/{clubId}/scout/{oppId}" {
		t.Errorf("scout = %s %s, want POST /api/play/{clubId}/scout/{oppId}", scout.Method, scout.Path)
	}
	wantStatuses := []int{200, 400, 401, 403, 404}
	if len(scout.Statuses) != len(wantStatuses) {
		t.Fatalf("statuses = %v, want %v", scout.Statuses, wantStatuses)
	}
	for i, s := range wantStatuses {
		if scout.Statuses[i] != s {
			t.Errorf("status[%d] = %d, want %d", i, scout.Statuses[i], s)
		}
	}
}
