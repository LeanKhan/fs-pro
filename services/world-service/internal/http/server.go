// Package http is the world-service's HTTP surface. Routing uses Go 1.22's
// net/http method+wildcard patterns (net/http, "ServeMux"); see
// docs/perfect/B1-1B-REPORT.md §2.1 for why the stdlib is enough.
//
// The endpoints implement docs/perfect/WORLD-SERVICE-CONTRACT.md verbatim: the
// Go service decides placement/pool assignment and Node persists. Every DB
// call goes through internal/db.Pool, which applies the configured per-call
// timeout; each request also has its own budget here.
package http

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"time"

	"fs-pro-world-service/internal/placement"
	"fs-pro-world-service/internal/pyramid"
	"fs-pro-world-service/internal/ranking"
)

// Version is stamped at build time with -ldflags "-X .../internal/http.Version=...".
var Version = "dev"

// requestTimeout bounds a whole handler, including its DB round trips.
const requestTimeout = 15 * time.Second

// Pinger is the subset of db.Pool the health check needs.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Spotter is the placement engine.
type Spotter interface {
	Spot(ctx context.Context, clubID, inviteToken string) (placement.Spot, error)
}

// Hierarchy is the place-tree query.
type Hierarchy interface {
	Children(ctx context.Context, placeID, kind string) ([]placement.Child, error)
}

// ProminenceStore reads and recomputes the prominence cache.
type ProminenceStore interface {
	Get(ctx context.Context, clubID string) (ranking.Prominence, error)
	Recompute(ctx context.Context, clubIDs []string) (int, error)
}

// PyramidEngine draws pools and finds mid-season slots.
type PyramidEngine interface {
	Draw(ctx context.Context, competitionID string) (pyramid.Assignment, error)
	Join(ctx context.Context, competitionID, clubID string) (pyramid.JoinResult, error)
}

// Deps are the domain services the HTTP layer needs.
type Deps struct {
	Placement  Spotter
	Hierarchy  Hierarchy
	Prominence ProminenceStore
	Pyramid    PyramidEngine
}

// Server is the world-service HTTP handler.
type Server struct {
	mux        *http.ServeMux
	log        *slog.Logger
	db         Pinger
	placement  Spotter
	hierarchy  Hierarchy
	prominence ProminenceStore
	pyramid    PyramidEngine
	started    time.Time
}

// New builds the server. A nil logger becomes slog.Default and a nil database
// pinger makes /health report the database as unconfigured (used by tests).
func New(logger *slog.Logger, database Pinger, deps Deps) *Server {
	if logger == nil {
		logger = slog.Default()
	}
	s := &Server{
		mux:        http.NewServeMux(),
		log:        logger,
		db:         database,
		placement:  deps.Placement,
		hierarchy:  deps.Hierarchy,
		prominence: deps.Prominence,
		pyramid:    deps.Pyramid,
		started:    time.Now(),
	}
	s.registerRoutes()
	return s
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("GET /health", s.handleHealth)
	s.mux.HandleFunc("POST /placement/spot", s.handlePlacementSpot)
	s.mux.HandleFunc("GET /places/{id}/children", s.handlePlaceChildren)
	s.mux.HandleFunc("GET /prominence/{clubId}", s.handleProminence)
	s.mux.HandleFunc("POST /prominence/recompute", s.handleRecompute)
	s.mux.HandleFunc("POST /pyramid/draw/{competitionId}", s.handlePyramidDraw)
	s.mux.HandleFunc("POST /pyramid/join", s.handlePyramidJoin)
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

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// POST /placement/spot
// ---------------------------------------------------------------------------

type placementSpotRequest struct {
	ClubID      string  `json:"clubId"`
	InviteToken *string `json:"inviteToken"`
}

type placementInviteResponse struct {
	PlaceID string `json:"placeId"`
	Level   string `json:"level"`
}

type placementSpotResponse struct {
	Kind       string                   `json:"kind"`
	DistrictID *string                  `json:"districtId"`
	CityID     *string                  `json:"cityId"`
	RegionID   *string                  `json:"regionId"`
	CountryID  *string                  `json:"countryId"`
	NeedsNames []string                 `json:"needsNames"`
	X          float64                  `json:"x"`
	Y          float64                  `json:"y"`
	Invite     *placementInviteResponse `json:"invite"`
}

func (s *Server) handlePlacementSpot(w http.ResponseWriter, r *http.Request) {
	if s.placement == nil {
		writeError(w, http.StatusServiceUnavailable, "placement is not configured")
		return
	}
	var req placementSpotRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.ClubID == "" {
		writeError(w, http.StatusBadRequest, "clubId is required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	token := ""
	if req.InviteToken != nil {
		token = *req.InviteToken
	}
	spot, err := s.placement.Spot(ctx, req.ClubID, token)
	if err != nil {
		s.fail(w, "placement spot", err)
		return
	}
	out := placementSpotResponse{
		Kind:       spot.Kind,
		DistrictID: spot.DistrictID,
		CityID:     spot.CityID,
		RegionID:   spot.RegionID,
		CountryID:  spot.CountryID,
		NeedsNames: spot.NeedsNames,
		X:          spot.X,
		Y:          spot.Y,
	}
	if out.NeedsNames == nil {
		out.NeedsNames = []string{}
	}
	if spot.Invite != nil {
		out.Invite = &placementInviteResponse{PlaceID: spot.Invite.PlaceID, Level: spot.Invite.Level}
	}
	writeJSON(w, http.StatusOK, out)
}

// ---------------------------------------------------------------------------
// GET /places/{id}/children
// ---------------------------------------------------------------------------

type placeChildResponse struct {
	ID       string  `json:"id"`
	Type     string  `json:"type"`
	Name     string  `json:"name"`
	Code     string  `json:"code"`
	ParentID string  `json:"parentId"`
	RegionID *string `json:"regionId"`
	MapX     float64 `json:"mapX"`
	MapY     float64 `json:"mapY"`
	Clubs    int     `json:"clubs"`
}

type placeChildrenResponse struct {
	Children []placeChildResponse `json:"children"`
}

func (s *Server) handlePlaceChildren(w http.ResponseWriter, r *http.Request) {
	if s.hierarchy == nil {
		writeError(w, http.StatusServiceUnavailable, "hierarchy is not configured")
		return
	}
	placeID := r.PathValue("id")
	if placeID == "" {
		writeError(w, http.StatusBadRequest, "place id is required")
		return
	}
	kind := r.URL.Query().Get("type")
	switch kind {
	case "", "region", "city", "district":
	default:
		writeError(w, http.StatusBadRequest, "type must be city, district or region")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	children, err := s.hierarchy.Children(ctx, placeID, kind)
	if err != nil {
		s.fail(w, "place children", err)
		return
	}
	out := placeChildrenResponse{Children: []placeChildResponse{}}
	for _, c := range children {
		out.Children = append(out.Children, placeChildResponse{
			ID:       c.ID,
			Type:     c.Type,
			Name:     c.Name,
			Code:     c.Code,
			ParentID: c.ParentID,
			RegionID: c.RegionID,
			MapX:     c.MapX,
			MapY:     c.MapY,
			Clubs:    c.Clubs,
		})
	}
	writeJSON(w, http.StatusOK, out)
}

// ---------------------------------------------------------------------------
// Prominence
// ---------------------------------------------------------------------------

type prominenceResponse struct {
	ClubID     string  `json:"clubId"`
	Prominence float64 `json:"prominence"`
	UpdatedAt  *string `json:"updatedAt"`
}

func (s *Server) handleProminence(w http.ResponseWriter, r *http.Request) {
	if s.prominence == nil {
		writeError(w, http.StatusServiceUnavailable, "prominence is not configured")
		return
	}
	clubID := r.PathValue("clubId")
	if clubID == "" {
		writeError(w, http.StatusBadRequest, "club id is required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	p, err := s.prominence.Get(ctx, clubID)
	if errors.Is(err, ranking.ErrClubNotFound) {
		writeError(w, http.StatusNotFound, "club not found")
		return
	}
	if err != nil {
		s.fail(w, "prominence", err)
		return
	}
	out := prominenceResponse{ClubID: p.ClubID, Prominence: p.Prominence}
	if p.UpdatedAt != nil {
		ts := p.UpdatedAt.UTC().Format(time.RFC3339)
		out.UpdatedAt = &ts
	}
	writeJSON(w, http.StatusOK, out)
}

type recomputeRequest struct {
	ClubIDs []string `json:"clubIds"`
}

type recomputeResponse struct {
	Updated int `json:"updated"`
}

func (s *Server) handleRecompute(w http.ResponseWriter, r *http.Request) {
	if s.prominence == nil {
		writeError(w, http.StatusServiceUnavailable, "prominence is not configured")
		return
	}
	var req recomputeRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	updated, err := s.prominence.Recompute(ctx, req.ClubIDs)
	if err != nil {
		s.fail(w, "prominence recompute", err)
		return
	}
	writeJSON(w, http.StatusOK, recomputeResponse{Updated: updated})
}

// ---------------------------------------------------------------------------
// Pyramid
// ---------------------------------------------------------------------------

type pyramidPoolResponse struct {
	Division    int      `json:"division"`
	RegionKey   string   `json:"regionKey"`
	CityKey     string   `json:"cityKey"`
	DistrictKey string   `json:"districtKey"`
	ClubIDs     []string `json:"clubIds"`
}

type pyramidDrawResponse struct {
	Pools []pyramidPoolResponse `json:"pools"`
}

func (s *Server) handlePyramidDraw(w http.ResponseWriter, r *http.Request) {
	if s.pyramid == nil {
		writeError(w, http.StatusServiceUnavailable, "pyramid is not configured")
		return
	}
	competitionID := r.PathValue("competitionId")
	if competitionID == "" {
		writeError(w, http.StatusBadRequest, "competition id is required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	assignment, err := s.pyramid.Draw(ctx, competitionID)
	if errors.Is(err, pyramid.ErrNoEdition) {
		writeError(w, http.StatusNotFound, "no drawable pyramid edition")
		return
	}
	if err != nil {
		s.fail(w, "pyramid draw", err)
		return
	}
	out := pyramidDrawResponse{Pools: []pyramidPoolResponse{}}
	for _, p := range assignment.Pools {
		ids := p.ClubIDs
		if ids == nil {
			ids = []string{}
		}
		out.Pools = append(out.Pools, pyramidPoolResponse{
			Division:    p.Division,
			RegionKey:   p.RegionKey,
			CityKey:     p.CityKey,
			DistrictKey: p.DistrictKey,
			ClubIDs:     ids,
		})
	}
	writeJSON(w, http.StatusOK, out)
}

type pyramidJoinRequest struct {
	CompetitionID string `json:"competitionId"`
	ClubID        string `json:"clubId"`
}

type pyramidJoinResponse struct {
	Division int     `json:"division"`
	PoolID   *string `json:"poolId"`
	Slot     int     `json:"slot"`
	NewPool  bool    `json:"newPool"`
}

func (s *Server) handlePyramidJoin(w http.ResponseWriter, r *http.Request) {
	if s.pyramid == nil {
		writeError(w, http.StatusServiceUnavailable, "pyramid is not configured")
		return
	}
	var req pyramidJoinRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.CompetitionID == "" || req.ClubID == "" {
		writeError(w, http.StatusBadRequest, "competitionId and clubId are required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	join, err := s.pyramid.Join(ctx, req.CompetitionID, req.ClubID)
	if errors.Is(err, pyramid.ErrNoEdition) {
		writeError(w, http.StatusNotFound, "no running pyramid edition")
		return
	}
	if err != nil {
		s.fail(w, "pyramid join", err)
		return
	}
	writeJSON(w, http.StatusOK, pyramidJoinResponse{
		Division: join.Division,
		PoolID:   join.PoolID,
		Slot:     join.Slot,
		NewPool:  join.NewPool,
	})
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(dst); err != nil {
		if errors.Is(err, io.EOF) {
			writeError(w, http.StatusBadRequest, "request body is required")
			return false
		}
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return false
	}
	return true
}

func (s *Server) fail(w http.ResponseWriter, what string, err error) {
	s.log.Error("request failed", "what", what, "err", err)
	writeError(w, http.StatusInternalServerError, what+" failed")
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
