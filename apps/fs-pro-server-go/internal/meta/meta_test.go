package meta

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"fs-pro-server/internal/config"
	"fs-pro-server/internal/httpapi"
)

func TestGetDbStatus(t *testing.T) {
	srv := httpapi.New(httpapi.Deps{
		Config: config.Config{Port: "3000", LogLevel: "error", RateLimitOff: true},
	})
	Register(srv)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/meta/db", nil))
	if rec.Code != 200 {
		t.Fatalf("status = %d", rec.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("bad JSON: %v", err)
	}
	if body["success"] != true || body["message"] != "Database status fetched successfully" {
		t.Fatalf("envelope = %v", body)
	}
	payload, _ := body["payload"].(map[string]any)
	if payload["backend"] != "postgresql" {
		t.Fatalf("payload = %v", body["payload"])
	}
}
