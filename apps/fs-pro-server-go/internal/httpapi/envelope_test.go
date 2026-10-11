package httpapi

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func decodeBody(t *testing.T, raw string) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		t.Fatalf("body is not JSON: %v (%q)", err, raw)
	}
	return m
}

func TestSuccessEnvelopeShape(t *testing.T) {
	rec := httptest.NewRecorder()
	Respond(rec, OK("done", map[string]any{"a": 1}))
	if rec.Code != 200 {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := decodeBody(t, rec.Body.String())
	if body["success"] != true || body["message"] != "done" {
		t.Fatalf("unexpected envelope: %v", body)
	}
	payload, ok := body["payload"].(map[string]any)
	if !ok || payload["a"] != float64(1) {
		t.Fatalf("unexpected payload: %v", body["payload"])
	}
}

func TestFailOmitsPayloadWhenNil(t *testing.T) {
	rec := httptest.NewRecorder()
	Respond(rec, Fail(404, "User not found", nil))
	if strings.Contains(rec.Body.String(), `"payload"`) {
		t.Fatalf("payload key must be omitted: %s", rec.Body.String())
	}
	body := decodeBody(t, rec.Body.String())
	if body["success"] != false || body["message"] != "User not found" {
		t.Fatalf("unexpected fail envelope: %v", body)
	}
}

func TestFailIncludesPayloadWhenPresent(t *testing.T) {
	rec := httptest.NewRecorder()
	Respond(rec, Fail(400, "Error", "boom"))
	body := decodeBody(t, rec.Body.String())
	if body["payload"] != "boom" {
		t.Fatalf("payload = %v, want boom", body["payload"])
	}
}

func TestDenyHasNoPayload(t *testing.T) {
	rec := httptest.NewRecorder()
	Respond(rec, Deny(401, "Not logged in"))
	if strings.Contains(rec.Body.String(), `"payload"`) {
		t.Fatalf("deny must not carry payload: %s", rec.Body.String())
	}
}

func TestNoHTMLEscaping(t *testing.T) {
	rec := httptest.NewRecorder()
	Respond(rec, OK("ok", map[string]any{"html": "<b>a&b</b>"}))
	if !strings.Contains(rec.Body.String(), "<b>a&b</b>") {
		t.Fatalf("HTML must not be escaped: %s", rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), `\u003c`) {
		t.Fatalf("found Go's default HTML escaping: %s", rec.Body.String())
	}
}

func TestArrayPayloadStaysArray(t *testing.T) {
	rec := httptest.NewRecorder()
	Respond(rec, OK("ok", []any{"a", "b"}))
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	arr, ok := body["payload"].([]any)
	if !ok || len(arr) != 2 {
		t.Fatalf("payload should be an array of 2, got %v", body["payload"])
	}
}
