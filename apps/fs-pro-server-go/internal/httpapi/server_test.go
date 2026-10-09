package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"fs-pro-server/internal/config"
)

func newTestServer(enableManifest bool, pinger func(context.Context) error) *Server {
	cfg := config.Config{Port: "3000", LogLevel: "error", RateLimitOff: true, EnableRouteManifest: enableManifest}
	return New(Deps{Config: cfg, Pinger: pinger})
}

func get(s *Server, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

func TestHealthWithoutDatabase(t *testing.T) {
	rec := get(newTestServer(false, nil), "/healthz")
	if rec.Code != 503 {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"ok":false`) {
		t.Fatalf("body = %s", rec.Body.String())
	}
}

func TestHealthWithDatabase(t *testing.T) {
	rec := get(newTestServer(false, func(context.Context) error { return nil }), "/healthz")
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"ok":true`) {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
}

func TestHealthDatabaseError(t *testing.T) {
	rec := get(newTestServer(false, func(context.Context) error { return errors.New("down") }), "/healthz")
	if rec.Code != 503 {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}

func TestWelcome(t *testing.T) {
	rec := get(newTestServer(false, nil), "/")
	if rec.Code != 200 {
		t.Fatalf("status = %d", rec.Code)
	}
	// Pin the literal from server.ts:151, not the server's own constant.
	const want = "<p>Welcome to FS-PRO <i>Server</i></p> enjoy!"
	if rec.Body.String() != want {
		t.Fatalf("welcome = %q, want %q", rec.Body.String(), want)
	}
}

func TestManifestDisabledByDefault(t *testing.T) {
	rec := get(newTestServer(false, nil), "/__routes")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("manifest must be 404 when disabled, got %d", rec.Code)
	}
}

func TestManifestListsB0Routes(t *testing.T) {
	s := newTestServer(true, nil)
	s.Register("users.getUser", http.MethodGet, "/api/users/{id}", []int{200, 400, 404},
		func(*Context, http.ResponseWriter, *http.Request) Response { return OK("ok", nil) })
	s.Register("users.joinUser", http.MethodPost, "/api/users/join", []int{200, 400},
		func(*Context, http.ResponseWriter, *http.Request) Response { return OK("ok", nil) })

	routes := s.Routes()
	seen := map[string]RouteInfo{}
	for _, r := range routes {
		seen[r.ID] = r
	}
	checks := []struct {
		id, method, path string
	}{
		{"health.getHealth", "GET", "/healthz"},
		{"root.getWelcome", "GET", "/{$}"},
		{"dev.getRouteManifest", "GET", "/__routes"},
		{"users.getUser", "GET", "/api/users/{id}"},
		{"users.joinUser", "POST", "/api/users/join"},
	}
	for _, c := range checks {
		r, ok := seen[c.id]
		if !ok {
			t.Fatalf("manifest missing %s", c.id)
		}
		if r.Method != c.method || r.Path != c.path {
			t.Fatalf("%s = %s %s, want %s %s", c.id, r.Method, r.Path, c.method, c.path)
		}
	}
	// Sorted by path.
	for i := 1; i < len(routes); i++ {
		if routes[i-1].Path > routes[i].Path {
			t.Fatalf("manifest not sorted: %s before %s", routes[i-1].Path, routes[i].Path)
		}
	}

	rec := get(s, "/__routes")
	if rec.Code != 200 {
		t.Fatalf("manifest status = %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"path":"/api/users/join"`) {
		t.Fatalf("manifest body = %s", rec.Body.String())
	}
}
