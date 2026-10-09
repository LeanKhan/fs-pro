package clients

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func withServer(t *testing.T, handler http.Handler) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Setenv("WORLD_SERVICE_URL", srv.URL)
	return srv
}

func TestProgramTipSuccess(t *testing.T) {
	srv := withServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/program/tip" || r.Method != http.MethodPost {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["now"] == nil {
			t.Error("request missing now")
		}
		_, _ = w.Write([]byte(`{"tip":{"id":"tip.x","speaker":"Coach","text":"hi","expr":"neutral","pose":"idle","target":null,"priority":1,"dismissible":true,"maxShows":1,"cooldownSeconds":0,"once":false}}`))
	}))
	defer srv.Close()

	out, err := ProgramTip(context.Background(), map[string]any{"now": float64(1)})
	if err != nil {
		t.Fatalf("ProgramTip: %v", err)
	}
	tip, _ := out["tip"].(map[string]any)
	if tip == nil || tip["id"] != "tip.x" {
		t.Errorf("tip = %v", out["tip"])
	}
}

func TestProgramTipNon2xx(t *testing.T) {
	srv := withServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusServiceUnavailable)
	}))
	defer srv.Close()
	_, err := ProgramTip(context.Background(), map[string]any{})
	if err == nil || err.Error() != "world-service POST /program/tip failed (503)" {
		t.Fatalf("err = %v", err)
	}
}

func TestProgramTipEngineDown(t *testing.T) {
	srv := withServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	url := srv.URL
	srv.Close() // now nothing is listening
	t.Setenv("WORLD_SERVICE_URL", url)
	_, err := ProgramTip(context.Background(), map[string]any{})
	if err == nil {
		t.Fatal("expected an error when the engine is down")
	}
	if strings.Contains(err.Error(), "failed (") {
		t.Errorf("connection failure should not look like a status failure: %v", err)
	}
}
