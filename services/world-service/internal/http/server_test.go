package http

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakePinger struct{ err error }

func (f fakePinger) Ping(ctx context.Context) error { return f.err }

func TestServerRoutes(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		path       string
		db         Pinger
		wantStatus int
		wantDB     string
		wantHealth bool
	}{
		{
			name:       "health without database",
			method:     http.MethodGet,
			path:       "/health",
			wantStatus: http.StatusOK,
			wantDB:     "unconfigured",
			wantHealth: true,
		},
		{
			name:       "health database up",
			method:     http.MethodGet,
			path:       "/health",
			db:         fakePinger{},
			wantStatus: http.StatusOK,
			wantDB:     "up",
			wantHealth: true,
		},
		{
			name:       "health database down is degraded",
			method:     http.MethodGet,
			path:       "/health",
			db:         fakePinger{err: errors.New("connection refused")},
			wantStatus: http.StatusServiceUnavailable,
			wantDB:     "down",
			wantHealth: true,
		},
		{name: "health rejects post", method: http.MethodPost, path: "/health", wantStatus: http.StatusMethodNotAllowed},
		{name: "unknown route", method: http.MethodGet, path: "/nope", wantStatus: http.StatusNotFound},
		{name: "placement placeholder", method: http.MethodPost, path: "/placement/found", wantStatus: http.StatusNotImplemented},
		{name: "hierarchy placeholder", method: http.MethodGet, path: "/places/abc/children", wantStatus: http.StatusNotImplemented},
		{name: "ranking placeholder", method: http.MethodGet, path: "/ranking/prominence", wantStatus: http.StatusNotImplemented},
		{name: "pyramid placeholder", method: http.MethodPost, path: "/pyramid/pools", wantStatus: http.StatusNotImplemented},
		{name: "tiles placeholder", method: http.MethodGet, path: "/tiles/3/1/2", wantStatus: http.StatusNotImplemented},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := New(nil, tt.db)
			req := httptest.NewRequest(tt.method, tt.path, nil)
			rec := httptest.NewRecorder()
			srv.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d (body %q)", rec.Code, tt.wantStatus, rec.Body.String())
			}
			if !tt.wantHealth {
				return
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Fatalf("Content-Type = %q, want application/json", ct)
			}
			var body healthResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatalf("decode health: %v (body %q)", err, rec.Body.String())
			}
			if body.Service != "fs-pro-world-service" {
				t.Errorf("service = %q, want fs-pro-world-service", body.Service)
			}
			if body.Database != tt.wantDB {
				t.Errorf("database = %q, want %q", body.Database, tt.wantDB)
			}
			if body.Time == "" {
				t.Error("time is empty")
			}
			if tt.wantStatus == http.StatusServiceUnavailable && body.Status != "degraded" {
				t.Errorf("status = %q, want degraded", body.Status)
			}
		})
	}
}

func TestNotImplementedBodyMentionsSpec(t *testing.T) {
	srv := New(nil, nil)
	req := httptest.NewRequest(http.MethodPost, "/placement/found", nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)

	if !strings.Contains(rec.Body.String(), "WORLD-HIERARCHY-SPEC") {
		t.Fatalf("body %q does not point at the spec", rec.Body.String())
	}
}
