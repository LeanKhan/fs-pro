package httpapi

import (
	"bytes"
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"time"

	"fs-pro-server/internal/config"
	"fs-pro-server/internal/session"
)

// contextMiddleware seeds the per-request Context.
func contextMiddleware(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cx := NewContext(logger)
		r = r.WithContext(WithContext(r.Context(), cx))
		next.ServeHTTP(w, r)
	})
}

// sessionMiddleware loads the session and, when it was saved, emits Set-Cookie.
// Responses are buffered so the cookie header is set before the status/body are
// written (express-session sets it before res.end).
func sessionMiddleware(m *session.Manager, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cx := Get(r)
		if cx == nil {
			next.ServeHTTP(w, r)
			return
		}
		if m != nil {
			cx.Session = m.Load(r.Context(), r)
		} else {
			cx.Session = &session.State{Data: map[string]any{}}
		}
		bw := newBufferWriter(w)
		next.ServeHTTP(bw, r)
		if cx.Session != nil && cx.Session.Dirty && m != nil {
			http.SetCookie(bw, m.Cookie(cx.Session))
		}
		bw.flush()
	})
}

// bufferWriter delays the response so middleware can still add headers
// (Set-Cookie) after the handler ran.
type bufferWriter struct {
	header      http.Header
	underlying  http.ResponseWriter
	status      int
	body        bytes.Buffer
	wroteHeader bool
}

func newBufferWriter(w http.ResponseWriter) *bufferWriter {
	return &bufferWriter{header: http.Header{}, underlying: w, status: http.StatusOK}
}

func (b *bufferWriter) Header() http.Header { return b.header }

func (b *bufferWriter) WriteHeader(code int) {
	if !b.wroteHeader {
		b.status = code
		b.wroteHeader = true
	}
}

func (b *bufferWriter) Write(p []byte) (int, error) {
	if !b.wroteHeader {
		b.WriteHeader(http.StatusOK)
	}
	return b.body.Write(p)
}

func (b *bufferWriter) flush() {
	dst := b.underlying.Header()
	for k, vs := range b.header {
		for _, v := range vs {
			dst.Add(k, v)
		}
	}
	b.underlying.WriteHeader(b.status)
	if b.body.Len() > 0 {
		_, _ = b.underlying.Write(b.body.Bytes())
	}
}

// recoverMiddleware turns a panic into a logged 500.
func recoverMiddleware(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				logger.Error("panic recovered", "err", rec, "path", r.URL.Path, "stack", string(debug.Stack()))
				writeJSON(w, http.StatusInternalServerError, map[string]any{
					"success": false, "message": "Internal server error",
				})
			}
		}()
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// requestLogger logs method, path, status and duration.
func requestLogger(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		logger.Info("request", "method", r.Method, "path", r.URL.Path, "status", rec.status,
			"ms", time.Since(start).Milliseconds())
	})
}

// securityHeaders mirrors the subset of helmet the API needs.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "SAMEORIGIN")
		h.Set("Cross-Origin-Resource-Policy", "cross-origin")
		h.Set("X-DNS-Prefetch-Control", "off")
		next.ServeHTTP(w, r)
	})
}

// corsMiddleware reproduces server.ts's whitelist + credentials behaviour.
func corsMiddleware(cfg config.Config, next http.Handler) http.Handler {
	whitelist := corsWhitelist(cfg)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && (cfg.IsDev() || whitelist[origin]) {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Allow-Credentials", "true")
			h.Add("Vary", "Origin")
			if r.Method == http.MethodOptions {
				h.Set("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE")
				if reqHeaders := r.Header.Get("Access-Control-Request-Headers"); reqHeaders != "" {
					h.Set("Access-Control-Allow-Headers", reqHeaders)
					h.Add("Vary", "Access-Control-Request-Headers")
				}
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func corsWhitelist(cfg config.Config) map[string]bool {
	out := map[string]bool{}
	add := func(o string) { out[strings.TrimRight(o, "/")] = true }
	add("http://localhost:8080")
	add("http://localhost:5173")
	add("http://127.0.0.1:8080")
	add("http://127.0.0.1:5173")
	host := cfg.RemoteHost
	if host == "" {
		host = "localhost"
	}
	add("http://" + host + ":8080")
	add("http://" + host + ":5173")
	for _, o := range cfg.CORSOrigins {
		add(o)
	}
	return out
}

// rateRule is one express-rate-limit configuration.
type rateRule struct {
	prefix string
	window time.Duration
	limit  int
	what   string
	key    string // "ip", "username" or "email"
	skip   func(path string) bool
}

func userRateRules() []rateRule {
	return []rateRule{
		{prefix: "/api/users/login", window: 15 * time.Minute, limit: 20, what: "login attempts", key: "ip"},
		{prefix: "/api/users/login", window: 15 * time.Minute, limit: 8, what: "login attempts for this account", key: "username"},
		{prefix: "/api/users/join", window: time.Hour, limit: 5, what: "sign-ups from this address", key: "ip"},
		{prefix: "/api/users/forgot-password", window: time.Hour, limit: 5, what: "password reset requests", key: "ip"},
		{prefix: "/api/users/forgot-password", window: time.Hour, limit: 3, what: "reset requests for this address", key: "email"},
		{prefix: "/api/users/reset-password", window: 15 * time.Minute, limit: 10, what: "password reset attempts", key: "ip"},
		{prefix: "/api/users/verify-email", window: 15 * time.Minute, limit: 20, what: "confirmation attempts", key: "ip"},
		{prefix: "/api/users/resend-verification", window: time.Hour, limit: 3, what: "confirmation emails", key: "ip"},
		{prefix: "/api/users/email", window: time.Hour, limit: 5, what: "email changes", key: "ip"},
		{prefix: "/api/users/change-password", window: 15 * time.Minute, limit: 10, what: "password changes", key: "ip"},
		{prefix: "/api/auth", window: 15 * time.Minute, limit: 60, what: "sign-in requests", key: "ip"},
		{prefix: "/api/atlas/clubs", window: time.Hour, limit: 10, what: "club foundings", key: "ip"},
		{prefix: "/api", window: time.Minute, limit: 600, what: "requests", key: "ip",
			skip: func(p string) bool {
				return strings.HasPrefix(p, "/api/crests/") || strings.HasPrefix(p, "/api/kits/")
			}},
	}
}

type rateLimiter struct {
	off    bool
	rules  []rateRule
	mu     sync.Mutex
	counts map[string]*counter
}

type counter struct {
	start time.Time
	n     int
}

func newRateLimiter(cfg config.Config) *rateLimiter {
	return &rateLimiter{off: cfg.RateLimitOff, rules: userRateRules(), counts: map[string]*counter{}}
}

func (rl *rateLimiter) middleware(trustProxy bool, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if rl.off || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		for i, rule := range rl.rules {
			if !strings.HasPrefix(r.URL.Path, rule.prefix) {
				continue
			}
			if rule.skip != nil && rule.skip(r.URL.Path) {
				continue
			}
			key := rl.keyFor(r, i, rule, trustProxy)
			if key == "" {
				continue
			}
			if rl.allow(key, rule.window, rule.limit) {
				continue
			}
			writeJSON(w, http.StatusTooManyRequests, map[string]any{
				"success": false,
				"message": "Too many " + rule.what + ". Please wait a few minutes and try again.",
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (rl *rateLimiter) keyFor(r *http.Request, ruleIndex int, rule rateRule, trustProxy bool) string {
	prefix := strconv.Itoa(ruleIndex) + "|"
	switch rule.key {
	case "username":
		username := ""
		if cx := Get(r); cx != nil {
			if body, ok := cx.BodyMap(); ok {
				username, _ = body["Username"].(string)
			}
		}
		return prefix + "u:" + strings.ToLower(username)
	case "email":
		email := ""
		if cx := Get(r); cx != nil {
			if body, ok := cx.BodyMap(); ok {
				email, _ = body["Email"].(string)
			}
		}
		return prefix + "e:" + strings.ToLower(strings.TrimSpace(email))
	default:
		return prefix + "ip:" + clientIP(r, trustProxy)
	}
}

func (rl *rateLimiter) allow(key string, window time.Duration, limit int) bool {
	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()
	c, ok := rl.counts[key]
	if !ok || now.Sub(c.start) >= window {
		rl.counts[key] = &counter{start: now, n: 1}
		return true
	}
	c.n++
	return c.n <= limit
}

func clientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
			return strings.TrimSpace(strings.Split(fwd, ",")[0])
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
