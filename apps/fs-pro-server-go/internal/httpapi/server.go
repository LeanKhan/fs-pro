package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"sort"
	"strings"

	"fs-pro-server/internal/config"
	"fs-pro-server/internal/metrics"
	"fs-pro-server/internal/policy"
	"fs-pro-server/internal/session"
)

// Handler is an envelope handler: it returns a Response that the server writes.
type Handler func(cx *Context, w http.ResponseWriter, r *http.Request) Response

// Deps are the server's collaborators.
type Deps struct {
	Config  config.Config
	Logger  *slog.Logger
	Session *session.Manager
	Access  policy.Access
	// Pinger reports the database health for GET /healthz; nil means "down".
	Pinger func(ctx context.Context) error
	// Metrics is the registry served at GET /metrics; nil uses the
	// process-wide metrics.Default() registry every instrumented package
	// writes to.
	Metrics *metrics.Registry
}

// Server owns the mux, the middleware chain and the route manifest.
type Server struct {
	cfg     config.Config
	logger  *slog.Logger
	mux     *http.ServeMux
	routes  []RouteInfo
	session *session.Manager
	access  policy.Access
	pinger  func(ctx context.Context) error
	metrics *metrics.Registry
	limiter *rateLimiter
	handler http.Handler
}

// New builds a Server and its middleware chain.
func New(deps Deps) *Server {
	logger := deps.Logger
	if logger == nil {
		logger = slog.Default()
	}
	access := deps.Access
	if access == nil {
		access = unavailableAccess{}
	}
	s := &Server{
		cfg:     deps.Config,
		logger:  logger,
		mux:     http.NewServeMux(),
		session: deps.Session,
		access:  access,
		pinger:  deps.Pinger,
		limiter: newRateLimiter(deps.Config),
	}
	s.metrics = deps.Metrics
	if s.metrics == nil {
		s.metrics = metrics.Default()
	}

	registerCore(s)

	var h http.Handler = s.mux
	h = s.limiter.middleware(strings.TrimSpace(deps.Config.TrustProxy) != "", h)
	h = sessionMiddleware(s.session, h)
	h = bodyMiddleware(h)
	h = securityHeaders(h)
	h = corsMiddleware(s.cfg, h)
	h = contextMiddleware(logger, h)
	h = requestLogger(logger, h)
	h = recoverMiddleware(logger, h)
	s.handler = h
	return s
}

// Handler returns the fully-wrapped http.Handler.
func (s *Server) Handler() http.Handler { return s.handler }

// Logger returns the server logger.
func (s *Server) Logger() *slog.Logger { return s.logger }

// Register adds an envelope route plus its route-policy guard.
func (s *Server) Register(id, method, path string, statuses []int, h Handler) {
	pattern := method + " " + path
	rule := policy.RuleFor(id, method)
	s.mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
		cx := Get(r)
		if cx != nil {
			cx.RouteID = id
		}
		if !policy.IsPublicHandler(id) {
			decision := policy.Enforce(r.Context(), rule, s.policyRequest(cx, method, r), s.access)
			if !decision.Allowed {
				Respond(w, Deny(decision.Status, decision.Message))
				return
			}
			if len(decision.Keep) > 0 && cx != nil {
				if body, ok := cx.BodyMap(); ok {
					policy.KeepFields(body, decision.Keep)
					cx.SetBodyMap(body)
				}
			}
		}
		Respond(w, h(cx, w, r))
	})
	s.addRoute(RouteInfo{ID: id, Method: method, Path: path, Statuses: statuses})
}

// RegisterRaw adds a non-envelope route (health, welcome, manifest).
func (s *Server) RegisterRaw(id, method, path string, statuses []int, h http.HandlerFunc) {
	s.mux.HandleFunc(method+" "+path, h)
	s.addRoute(RouteInfo{ID: id, Method: method, Path: path, Statuses: statuses})
}

// HandleRaw registers a mux pattern without a manifest entry (used when several
// contract paths share one catch-all pattern that the manifest lists
// separately).
func (s *Server) HandleRaw(method, path string, h http.HandlerFunc) {
	s.mux.HandleFunc(method+" "+path, h)
}

// ManifestOnly records a route in the manifest without registering a mux
// pattern.
func (s *Server) ManifestOnly(id, method, path string, statuses []int) {
	s.addRoute(RouteInfo{ID: id, Method: method, Path: path, Statuses: statuses})
}

func (s *Server) policyRequest(cx *Context, method string, r *http.Request) policy.Request {
	var body map[string]any
	if cx != nil {
		body, _ = cx.BodyMap()
	}
	return policy.Request{
		Method: method,
		UserID: SessionUserID(r),
		Param:  r.PathValue,
		Body:   body,
		Query:  r.URL.Query(),
	}
}

func (s *Server) addRoute(info RouteInfo) {
	s.routes = append(s.routes, info)
}

// Routes returns the manifest, sorted by path then method.
func (s *Server) Routes() []RouteInfo {
	out := make([]RouteInfo, len(s.routes))
	copy(out, s.routes)
	sort.Slice(out, func(i, j int) bool {
		if out[i].Path != out[j].Path {
			return out[i].Path < out[j].Path
		}
		return out[i].Method < out[j].Method
	})
	return out
}

// unavailableAccess is used when there is no database: every identity check
// fails closed.
type unavailableAccess struct{}

func (unavailableAccess) IsAdmin(context.Context, string) (bool, bool, error) {
	return false, false, nil
}
func (unavailableAccess) OwnsClub(context.Context, string, string) (policy.Ownership, error) {
	return policy.Missing, nil
}
func (unavailableAccess) PlayerClub(context.Context, string) (string, bool, error) {
	return "", false, nil
}
func (unavailableAccess) FixtureTeams(context.Context, string) (string, string, bool, error) {
	return "", "", false, nil
}
