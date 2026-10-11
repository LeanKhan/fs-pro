package support

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"fs-pro-server/internal/httpapi"
)

func TestRealtimeFromEnv(t *testing.T) {
	// Default: enabled, ws public URL derived from the http url.
	c := realtimeFromEnv("", "", "")
	if !c.enabled {
		t.Error("default config must be enabled (REALTIME_URL unset)")
	}
	if c.secret != devRealtimeSecret {
		t.Errorf("default secret = %q", c.secret)
	}
	if c.publicURL != "ws://localhost:3005" {
		t.Errorf("default publicURL = %q", c.publicURL)
	}
	// Explicit public URL wins; https -> wss.
	c = realtimeFromEnv("https://rt.example", "s3cret", "https://pub.example/")
	if c.publicURL != "wss://pub.example" {
		t.Errorf("publicURL = %q, want wss://pub.example", c.publicURL)
	}
	// "off" disables.
	if c := realtimeFromEnv("off", "", ""); c.enabled {
		t.Error("REALTIME_URL=off must disable the ticket")
	}
}

func TestSignTicketRoundTrip(t *testing.T) {
	secret := "shh"
	ticket, err := signTicket(secret, ticketClaims{UID: "u1", Name: "Ada", Clubs: []string{"c1"}, Expires: 42})
	if err != nil {
		t.Fatalf("signTicket: %v", err)
	}
	parts := strings.Split(ticket, ".")
	if len(parts) != 2 {
		t.Fatalf("ticket = %q, want two dot-parts", ticket)
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	// The signature must be the HMAC-SHA256 of the payload (gateway contract).
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	if parts[1] != base64.RawURLEncoding.EncodeToString(mac.Sum(nil)) {
		t.Error("signature does not match HMAC-SHA256(payload)")
	}
	var claims ticketClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		t.Fatalf("unmarshal claims: %v", err)
	}
	if claims.UID != "u1" || claims.Name != "Ada" || claims.Expires != 42 {
		t.Errorf("claims = %+v", claims)
	}
}

// worldgenStub starts a fake worldgen service and returns its URL + a close fn.
func worldgenStub(t *testing.T) (*httptest.Server, *string) {
	t.Helper()
	var lastPath string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		lastPath = r.URL.Path
		switch r.URL.Path {
		case "/faces/generate":
			w.Header().Set("Cache-Control", "public, max-age=1")
			w.Header().Set("Content-Type", "image/svg+xml")
			_, _ = w.Write([]byte("<svg>" + r.URL.Query().Get("identity") + "</svg>"))
		case "/names/generate":
			httpapi.WriteJSON(w, 200, map[string]any{"names": []string{"A__B", "C__D"}})
		case "/names/family":
			httpapi.WriteJSON(w, 200, map[string]any{"names": []string{"Ada", "Grace"}})
		case "/health":
			w.WriteHeader(http.StatusOK)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(ts.Close)
	return ts, &lastPath
}

func requestWith(t *testing.T, method, target string, body map[string]any) *http.Request {
	t.Helper()
	r := httptest.NewRequest(method, target, nil)
	cx := httpapi.NewContext(nil)
	if body != nil {
		cx.SetBodyMap(body)
	}
	r = r.WithContext(httpapi.WithContext(r.Context(), cx))
	return r
}

func TestWorldgenFaceProxy(t *testing.T) {
	ts, _ := worldgenStub(t)
	h := New(Deps{WorldgenURL: ts.URL})
	rec := httptest.NewRecorder()
	h.worldgenFace(rec, requestWith(t, http.MethodGet, "/api/services/worldgen/faces?identity=abc", nil))
	if rec.Code != 200 {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "image/svg+xml") {
		t.Errorf("content-type = %q", ct)
	}
	if rec.Header().Get("Cache-Control") != "public, max-age=1" {
		t.Errorf("cache-control not passed through: %q", rec.Header().Get("Cache-Control"))
	}
	if got := rec.Body.String(); got != "<svg>abc</svg>" {
		t.Errorf("body = %q", got)
	}

	// Missing identity -> 400.
	rec = httptest.NewRecorder()
	h.worldgenFace(rec, requestWith(t, http.MethodGet, "/api/services/worldgen/faces", nil))
	if rec.Code != 400 {
		t.Errorf("missing identity status = %d, want 400", rec.Code)
	}
}

func TestWorldgenNamesProxy(t *testing.T) {
	ts, _ := worldgenStub(t)
	h := New(Deps{WorldgenURL: ts.URL})

	rec := httptest.NewRecorder()
	h.worldgenNames(rec, requestWith(t, http.MethodPost, "/api/services/worldgen/names",
		map[string]any{"count": float64(2), "culture": "kev"}))
	if rec.Code != 200 {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	var out struct {
		Success bool     `json:"success"`
		Names   []string `json:"names"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !out.Success || len(out.Names) != 2 || out.Names[0] != "A__B" {
		t.Errorf("names response = %+v", out)
	}

	// Non-integer count -> 400.
	rec = httptest.NewRecorder()
	h.worldgenNames(rec, requestWith(t, http.MethodPost, "/api/services/worldgen/names",
		map[string]any{"count": 1.5, "culture": "kev"}))
	if rec.Code != 400 {
		t.Errorf("fractional count status = %d, want 400", rec.Code)
	}

	// Missing culture -> 400.
	rec = httptest.NewRecorder()
	h.worldgenNames(rec, requestWith(t, http.MethodPost, "/api/services/worldgen/names",
		map[string]any{"count": float64(2)}))
	if rec.Code != 400 {
		t.Errorf("missing culture status = %d, want 400", rec.Code)
	}
}

func TestWorldgenFamilyNames(t *testing.T) {
	ts, _ := worldgenStub(t)
	h := New(Deps{WorldgenURL: ts.URL})
	rec := httptest.NewRecorder()
	h.worldgenFamilyNames(rec, requestWith(t, http.MethodPost, "/api/services/worldgen/names/family",
		map[string]any{"count": float64(2), "culture": "kev", "lastname": "Smith"}))
	if rec.Code != 200 {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Grace") {
		t.Errorf("family names body = %s", rec.Body.String())
	}
}

func TestWorldgenHealth(t *testing.T) {
	ts, _ := worldgenStub(t)
	h := New(Deps{WorldgenURL: ts.URL})
	rec := httptest.NewRecorder()
	h.worldgenHealth(rec, requestWith(t, http.MethodGet, "/api/services/worldgen/health", nil))
	if rec.Code != 200 {
		t.Fatalf("healthy status = %d", rec.Code)
	}
	// A dead worldgen -> 503.
	h = New(Deps{WorldgenURL: "http://127.0.0.1:1"})
	rec = httptest.NewRecorder()
	h.worldgenHealth(rec, requestWith(t, http.MethodGet, "/api/services/worldgen/health", nil))
	if rec.Code != 503 {
		t.Errorf("dead worldgen status = %d, want 503", rec.Code)
	}
}
