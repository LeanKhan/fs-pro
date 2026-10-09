package clients

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSimulateMatchSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/sim/match" || r.Method != http.MethodPost {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"ok":true,"fixtureId":"f1","match":{"Home":{"_id":"h"},"Away":{"_id":"a"},"Details":{"HomeTeamScore":2,"AwayTeamScore":1},"Events":[],"Frames":{"roster":[]}},"metrics":{"simulationMs":1,"totalMs":1}}`))
	}))
	defer srv.Close()
	t.Setenv("SIM_SERVICE_URL", srv.URL)

	match, err := SimulateMatch(context.Background(), map[string]any{"fixtureId": "f1"})
	if err != nil {
		t.Fatalf("SimulateMatch: %v", err)
	}
	details, _ := match["Details"].(map[string]any)
	if details["HomeTeamScore"].(float64) != 2 {
		t.Errorf("details = %v", match["Details"])
	}
}

func TestSimulateMatchErrorPaths(t *testing.T) {
	// Non-2xx.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	t.Setenv("SIM_SERVICE_URL", srv.URL)
	if _, err := SimulateMatch(context.Background(), map[string]any{}); err == nil {
		t.Error("non-2xx must error")
	}
	srv.Close()

	// ok:false.
	srv2 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"ok":false,"error":"engine exploded"}`))
	}))
	t.Setenv("SIM_SERVICE_URL", srv2.URL)
	defer srv2.Close()
	if _, err := SimulateMatch(context.Background(), map[string]any{}); err == nil {
		t.Error("ok:false must error")
	}
}
