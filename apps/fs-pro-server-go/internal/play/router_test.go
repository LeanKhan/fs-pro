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
	if playCount != 14 {
		t.Fatalf("registered %d play routes, want 14", playCount)
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

	// The P5 raid routes: exact id/method/path/statuses.
	claim, ok := seen["play.claimBoardVault"]
	if !ok {
		t.Fatal("play.claimBoardVault is not registered")
	}
	if claim.Method != http.MethodPost || claim.Path != "/api/play/{clubId}/board-vault/claim" {
		t.Errorf("claim = %s %s", claim.Method, claim.Path)
	}
	wantClaim := []int{200, 400, 401, 403, 404, 409}
	if len(claim.Statuses) != len(wantClaim) {
		t.Fatalf("claim statuses = %v, want %v", claim.Statuses, wantClaim)
	}
	for i, s := range wantClaim {
		if claim.Statuses[i] != s {
			t.Errorf("claim status[%d] = %d, want %d", i, claim.Statuses[i], s)
		}
	}
	def, ok := seen["play.defenseLog"]
	if !ok {
		t.Fatal("play.defenseLog is not registered")
	}
	if def.Method != http.MethodGet || def.Path != "/api/play/{clubId}/defenses" {
		t.Errorf("defenseLog = %s %s", def.Method, def.Path)
	}
	wantDef := []int{200, 400, 404}
	if len(def.Statuses) != len(wantDef) {
		t.Fatalf("defenseLog statuses = %v, want %v", def.Statuses, wantDef)
	}
	for i, s := range wantDef {
		if def.Statuses[i] != s {
			t.Errorf("defenseLog status[%d] = %d, want %d", i, def.Statuses[i], s)
		}
	}
}
