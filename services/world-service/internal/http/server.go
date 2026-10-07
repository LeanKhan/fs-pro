// Package http is the world-service's HTTP surface.
//
// Routing uses Go 1.22's net/http method+wildcard patterns. The stdlib serve
// mux accepts patterns that "can match the method, host and path of a
// request" and path wildcards of the form {NAME} (net/http, "ServeMux", Go
// 1.24 source at src/net/http/server.go:2467-2509). The service has a handful
// of routes and no need for route groups, so a third-party router (chi) would
// add a dependency for features the stdlib already has; see
// docs/perfect/B1-1B-REPORT.md for the chi README comparison.
//
// Batch 2 and Batch 3 fill in the placement, ranking, pyramid and tile
// handlers. Until then each placeholder route answers 501 with a pointer to the
// spec, so the service is never mistaken for implemented.
package http

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"
)

// Version is stamped at build time with -ldflags "-X .../internal/http.Version=...".
var Version = "dev"

// Pinger is the subset of db.Pool the health check needs. Declaring it here
// (instead of importing internal/db) keeps the HTTP layer testable with a fake
// and free of database coupling.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Server is the world-service HTTP handler.
type Server struct {
	mux     *http.ServeMux
	log     *slog.Logger
	db      Pinger
	started time.Time
}

// New builds the server. A nil logger becomes slog.Default, and a nil database
// pinger makes /health report the database as unconfigured (used by tests).
func New(logger *slog.Logger, database Pinger) *Server {
	if logger == nil {
		logger = slog.Default()
	}
	s := &Server{
		mux:     http.NewServeMux(),
		log:     logger,
		db:      database,
		started: time.Now(),
	}
	s.registerRoutes()
	return s
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("GET /health", s.handleHealth)

	// Placeholders. Batch 2 (placement, ranking, pyramid) and Batch 3 (tiles)
	// replace each with a real implementation per the approved spec.
	s.mux.HandleFunc("POST /placement/found", s.notImplemented("placement"))
	s.mux.HandleFunc("GET /places/{id}/children", s.notImplemented("place hierarchy"))
	s.mux.HandleFunc("GET /ranking/prominence", s.notImplemented("prominence ranking"))
	s.mux.HandleFunc("POST /pyramid/pools", s.notImplemented("pyramid pool assignment"))
	s.mux.HandleFunc("GET /tiles/{z}/{x}/{y}", s.notImplemented("map tiles"))
}

// ServeHTTP logs every request with its status and duration, then dispatches.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	sw := &statusWriter{ResponseWriter: w}
	s.mux.ServeHTTP(sw, r)
	s.log.Info("http request",
		"method", r.Method,
		"path", r.URL.Path,
		"status", sw.statusCode(),
		"duration_ms", time.Since(start).Milliseconds(),
	)
}

type healthResponse struct {
	Status        string  `json:"status"`
	Service       string  `json:"service"`
	Version       string  `json:"version"`
	Database      string  `json:"database"`
	UptimeSeconds float64 `json:"uptimeSeconds"`
	Time          string  `json:"time"`
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	resp := healthResponse{
		Status:        "ok",
		Service:       "fs-pro-world-service",
		Version:       Version,
		Database:      "unconfigured",
		UptimeSeconds: time.Since(s.started).Seconds(),
		Time:          time.Now().UTC().Format(time.RFC3339),
	}

	code := http.StatusOK
	if s.db != nil {
		// db.Pool.Ping applies the configured context timeout.
		if err := s.db.Ping(r.Context()); err != nil {
			resp.Status = "degraded"
			resp.Database = "down"
			code = http.StatusServiceUnavailable
			s.log.Warn("health: database ping failed", "err", err)
		} else {
			resp.Database = "up"
		}
	}
	writeJSON(w, code, resp)
}

func (s *Server) notImplemented(capability string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotImplemented,
			capability+" is not implemented yet (Batch 2/3; see docs/perfect/WORLD-HIERARCHY-SPEC.md)")
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// statusWriter records the status code for request logging.
type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	if w.status == 0 {
		w.status = code
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.ResponseWriter.Write(b)
}

func (w *statusWriter) statusCode() int {
	if w.status == 0 {
		return http.StatusOK
	}
	return w.status
}
