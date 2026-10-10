package httpapi

import (
	"context"
	"net/http"
	"time"
)

// welcomeHTML is the exact string server.ts sends for GET /.
const welcomeHTML = "<p>Welcome to FS-PRO <i>Server</i></p> enjoy!"

// registerCore registers the non-domain B0 routes: health, welcome, the meta
// route and the dev-only route manifest.
func registerCore(s *Server) {
	s.RegisterRaw("health.getHealth", http.MethodGet, "/healthz", []int{200, 503}, s.healthHandler)
	s.RegisterRaw("root.getWelcome", http.MethodGet, "/{$}", []int{200}, func(w http.ResponseWriter, _ *http.Request) {
		WriteText(w, 200, "text/html; charset=utf-8", welcomeHTML)
	})
	// GET /metrics is a raw, unauthenticated ops endpoint like /healthz. It is
	// deliberately NOT a contract route (its id is outside the checked domains),
	// so contract-check is unaffected.
	s.RegisterRaw("metrics.getMetrics", http.MethodGet, "/metrics", []int{200}, s.metricsHandler)
	if s.cfg.EnableRouteManifest {
		s.RegisterRaw("dev.getRouteManifest", http.MethodGet, "/__routes", []int{200}, s.manifestHandler)
	}
}

// healthHandler reports whether the database answers.
func (s *Server) healthHandler(w http.ResponseWriter, r *http.Request) {
	if s.pinger == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.pinger(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// metricsHandler serves the Prometheus text exposition of the server's
// registry. Like /healthz it is unauthenticated and returns 200 as long as the
// process is up, so a scrape never needs credentials.
func (s *Server) metricsHandler(w http.ResponseWriter, _ *http.Request) {
	s.metrics.WritePrometheus(w)
}
