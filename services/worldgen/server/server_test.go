package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHealthEndpoint(t *testing.T) {
	srv := NewServer()

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d", w.Code)
	}

	var res map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("Failed to parse health JSON: %v", err)
	}
	if res["status"] != "ok" || res["service"] != "fs-pro-worldgen" {
		t.Fatalf("Unexpected health response: %v", res)
	}
}

func get(t *testing.T, srv *Server, target string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("GET", target, nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	return w
}

func post(t *testing.T, srv *Server, path string, body interface{}) *httptest.ResponseRecorder {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	req := httptest.NewRequest("POST", path, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	return w
}

func decodeNames(t *testing.T, w *httptest.ResponseRecorder) []string {
	t.Helper()
	var res struct {
		Names []string `json:"names"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("Failed to parse names JSON: %v", err)
	}
	return res.Names
}

// ---- names -----------------------------------------------------------

func TestGenerateNamesEndpoint(t *testing.T) {
	srv := NewServer()

	w := post(t, srv, "/names/generate", map[string]interface{}{
		"count": 5, "culture": "kev", "returnParts": "f_l",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	names := decodeNames(t, w)
	if len(names) != 5 {
		t.Fatalf("Expected 5 names, got %d: %v", len(names), names)
	}
	for _, n := range names {
		if n == "" {
			t.Fatalf("Empty name in response: %v", names)
		}
	}
}

func TestGenerateNamesDefaultsReturnParts(t *testing.T) {
	srv := NewServer()

	w := post(t, srv, "/names/generate", map[string]interface{}{"count": 3, "culture": "bellean"})
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if got := decodeNames(t, w); len(got) != 3 {
		t.Fatalf("Expected 3 names, got %v", got)
	}
}

func TestFamilyNamesEndpoint(t *testing.T) {
	srv := NewServer()

	w := post(t, srv, "/names/family", map[string]interface{}{
		"count": 4, "lastname": "Kestrel", "culture": "kev",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	names := decodeNames(t, w)
	if len(names) != 4 {
		t.Fatalf("Expected 4 names, got %v", names)
	}
	for _, n := range names {
		if !strings.HasSuffix(n, "__Kestrel") {
			t.Fatalf("Name %q does not end in __Kestrel", n)
		}
	}
}

func TestGenerateRejectsBadCount(t *testing.T) {
	srv := NewServer()

	w := post(t, srv, "/names/generate", map[string]interface{}{"count": 0, "culture": "kev"})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 for count 0, got %d", w.Code)
	}
}

func TestGenerateRejectsUnknownCulture(t *testing.T) {
	srv := NewServer()

	w := post(t, srv, "/names/generate", map[string]interface{}{"count": 1, "culture": "martian"})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 for unknown culture, got %d", w.Code)
	}
}

func TestGenerateRejectsNoCultureOrCountry(t *testing.T) {
	srv := NewServer()

	w := post(t, srv, "/names/generate", map[string]interface{}{"count": 1})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 when neither culture nor country is set, got %d", w.Code)
	}
}

func TestCulturesEndpoint(t *testing.T) {
	srv := NewServer()

	w := get(t, srv, "/cultures")
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var res struct {
		Cultures []struct {
			ID         string `json:"id"`
			FirstNames int    `json:"firstNames"`
			Surnames   int    `json:"surnames"`
		} `json:"cultures"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("parse cultures: %v", err)
	}
	if len(res.Cultures) < 8 {
		t.Fatalf("Expected >= 8 cultures, got %d", len(res.Cultures))
	}
	for _, c := range res.Cultures {
		if c.FirstNames < 400 || c.Surnames < 400 {
			t.Errorf("culture %s below floors: first=%d last=%d", c.ID, c.FirstNames, c.Surnames)
		}
	}
}

func TestGenerateEveryKindEndpoint(t *testing.T) {
	srv := NewServer()
	kinds := []string{"first", "last", "full", "club", "region", "city", "district", "stadium"}
	for _, kind := range kinds {
		w := post(t, srv, "/names/generate", map[string]interface{}{
			"count": 5, "culture": "kiyoto", "kind": kind, "seed": 1,
		})
		if w.Code != http.StatusOK {
			t.Fatalf("kind %s: expected 200, got %d: %s", kind, w.Code, w.Body.String())
		}
		names := decodeNames(t, w)
		if len(names) != 5 {
			t.Fatalf("kind %s: expected 5 names, got %v", kind, names)
		}
		for _, n := range names {
			if strings.TrimSpace(n) == "" {
				t.Fatalf("kind %s: empty name in %v", kind, names)
			}
		}
		if kind == "full" && !strings.Contains(names[0], "__") {
			t.Fatalf("full name %q missing separator", names[0])
		}
	}
}

func TestGenerateSeedIsDeterministic(t *testing.T) {
	srv := NewServer()
	body := map[string]interface{}{"count": 12, "culture": "karsh", "kind": "full", "seed": 777}
	a := decodeNames(t, post(t, srv, "/names/generate", body))
	b := decodeNames(t, post(t, srv, "/names/generate", body))
	if strings.Join(a, "|") != strings.Join(b, "|") {
		t.Fatalf("same seed produced different names: %v vs %v", a, b)
	}
}

func TestGenerateMixedEndpoint(t *testing.T) {
	srv := NewServer()

	w := post(t, srv, "/names/generate", map[string]interface{}{
		"count": 40, "country": "bellean", "kind": "full", "seed": 5,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var res struct {
		Names    []string       `json:"names"`
		Cultures map[string]int `json:"cultures"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("parse mixed response: %v", err)
	}
	if len(res.Names) != 40 {
		t.Fatalf("Expected 40 names, got %d", len(res.Names))
	}
	sum := 0
	for _, v := range res.Cultures {
		sum += v
	}
	if sum != 40 || len(res.Cultures) < 2 {
		t.Fatalf("Expected a mixed histogram summing to 40, got %v", res.Cultures)
	}
}

func TestMixedNamesEndpoint(t *testing.T) {
	srv := NewServer()

	w := post(t, srv, "/names/mixed", map[string]interface{}{
		"count": 10, "country": "upp", "kind": "club", "seed": 3,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if names := decodeNames(t, w); len(names) != 10 {
		t.Fatalf("Expected 10 names, got %v", names)
	}
}

// ---- faces -----------------------------------------------------------

func TestGenerateFaceEndpoint(t *testing.T) {
	srv := NewServer()

	w := get(t, srv, "/faces/generate?identity=player-001&version=v3")
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if ct := w.Header().Get("Content-Type"); ct != "image/svg+xml" {
		t.Fatalf("Expected image/svg+xml, got %q", ct)
	}
	svg := w.Body.String()
	if !strings.HasPrefix(svg, "<svg") || !strings.HasSuffix(svg, "</svg>") {
		t.Fatalf("Response is not an SVG document: %.80s", svg)
	}
}

// The same identity + version must always return byte-identical SVG;
// avatars at the same URL must never change.
func TestGenerateFaceIsDeterministic(t *testing.T) {
	srv := NewServer()

	first := get(t, srv, "/faces/generate?identity=player-001&version=v3").Body.String()
	second := get(t, srv, "/faces/generate?identity=player-001&version=v3").Body.String()
	if first != second {
		t.Fatal("Same identity + version produced different SVGs")
	}

	other := get(t, srv, "/faces/generate?identity=player-002&version=v3").Body.String()
	if other == first {
		t.Fatal("Different identities produced the same face")
	}
}

func TestGenerateFaceDefaultsVersion(t *testing.T) {
	srv := NewServer()

	w := get(t, srv, "/faces/generate?identity=player-001")
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestGenerateFaceRequiresIdentity(t *testing.T) {
	srv := NewServer()

	w := get(t, srv, "/faces/generate?version=v3")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 for missing identity, got %d", w.Code)
	}
}

func TestGenerateFaceRejectsUnknownVersion(t *testing.T) {
	srv := NewServer()

	w := get(t, srv, "/faces/generate?identity=player-001&version=v99")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 for unknown version, got %d", w.Code)
	}
}
