package http

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"fs-pro-world-service/internal/placement"
	"fs-pro-world-service/internal/pyramid"
	"fs-pro-world-service/internal/ranking"
	"fs-pro-world-service/internal/tiles"
)

type fakePinger struct{ err error }

func (f fakePinger) Ping(ctx context.Context) error { return f.err }

type fakePlacement struct {
	spot     placement.Spot
	err      error
	lastClub string
}

func (f *fakePlacement) Spot(_ context.Context, clubID, inviteToken string) (placement.Spot, error) {
	f.lastClub = clubID
	return f.spot, f.err
}

type fakeHierarchy struct {
	children []placement.Child
	err      error
}

func (f *fakeHierarchy) Children(_ context.Context, placeID, kind string) ([]placement.Child, error) {
	return f.children, f.err
}

type fakeProminence struct {
	p       ranking.Prominence
	err     error
	updated int
}

func (f *fakeProminence) Get(_ context.Context, clubID string) (ranking.Prominence, error) {
	return f.p, f.err
}

func (f *fakeProminence) Recompute(_ context.Context, clubIDs []string) (int, error) {
	return f.updated, f.err
}

type fakePyramid struct {
	assignment pyramid.Assignment
	join       pyramid.JoinResult
	err        error
}

func (f *fakePyramid) Draw(_ context.Context, competitionID string) (pyramid.Assignment, error) {
	return f.assignment, f.err
}

func (f *fakePyramid) Join(_ context.Context, competitionID, clubID string) (pyramid.JoinResult, error) {
	return f.join, f.err
}

type fakeTiles struct {
	tile tiles.Tile
	err  error
}

func (f *fakeTiles) Build(_ context.Context, key tiles.Key) (tiles.Tile, error) {
	if f.err != nil {
		return tiles.Tile{}, f.err
	}
	t := f.tile
	t.Key = key
	return t, nil
}

func strp(s string) *string { return &s }

func newTestServer(t *testing.T, deps Deps, db Pinger) *Server {
	t.Helper()
	return New(nil, db, deps)
}

func do(t *testing.T, srv *Server, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, path, nil)
	} else {
		r = httptest.NewRequest(method, path, strings.NewReader(body))
	}
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, r)
	return rec
}

func TestHealth(t *testing.T) {
	tests := []struct {
		name       string
		db         Pinger
		wantStatus int
		wantDB     string
	}{
		{name: "no database", wantStatus: http.StatusOK, wantDB: "unconfigured"},
		{name: "up", db: fakePinger{}, wantStatus: http.StatusOK, wantDB: "up"},
		{name: "down", db: fakePinger{err: errors.New("refused")}, wantStatus: http.StatusServiceUnavailable, wantDB: "down"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, newTestServer(t, Deps{}, tt.db), http.MethodGet, "/health", "")
			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			var body healthResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if body.Database != tt.wantDB || body.Service != "fs-pro-world-service" {
				t.Fatalf("body = %+v", body)
			}
		})
	}
}

func TestPlacementSpot(t *testing.T) {
	pm := &fakePlacement{spot: placement.Spot{
		Kind:       "district",
		CityID:     strp("city-1"),
		RegionID:   strp("region-1"),
		CountryID:  strp("country-1"),
		NeedsNames: []string{},
		X:          12.5,
		Y:          34.5,
		Invite:     &placement.Invite{PlaceID: "dist-9", Level: "district"},
	}}
	srv := newTestServer(t, Deps{Placement: pm}, nil)

	rec := do(t, srv, http.MethodPost, "/placement/spot", `{"clubId":"club-1","inviteToken":null}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	var body placementSpotResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Kind != "district" || body.CityID == nil || *body.CityID != "city-1" {
		t.Fatalf("body = %+v", body)
	}
	if body.NeedsNames == nil || body.Invite == nil || body.Invite.PlaceID != "dist-9" {
		t.Fatalf("needsNames/invite wrong: %+v", body)
	}
	if pm.lastClub != "club-1" {
		t.Fatalf("clubId not passed through: %q", pm.lastClub)
	}

	// Empty inviteToken must not panic and must be treated as no invite.
	rec = do(t, srv, http.MethodPost, "/placement/spot", `{"clubId":"club-2"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("no-token status = %d", rec.Code)
	}

	// Missing clubId is a 400.
	rec = do(t, srv, http.MethodPost, "/placement/spot", `{"clubId":""}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("missing clubId status = %d, want 400", rec.Code)
	}

	// Empty body is a 400, not a panic.
	rec = do(t, srv, http.MethodPost, "/placement/spot", "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("empty body status = %d, want 400", rec.Code)
	}
}

func TestPlaceChildren(t *testing.T) {
	h := &fakeHierarchy{children: []placement.Child{
		{ID: "c1", Type: "city", Name: "London", Code: "LON", ParentID: "country-1", RegionID: strp("r1"), MapX: 1, MapY: 2, Clubs: 7},
	}}
	srv := newTestServer(t, Deps{Hierarchy: h}, nil)

	rec := do(t, srv, http.MethodGet, "/places/country-1/children?type=city", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	var body placeChildrenResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Children) != 1 || body.Children[0].Name != "London" || body.Children[0].Clubs != 7 {
		t.Fatalf("body = %+v", body)
	}

	rec = do(t, srv, http.MethodGet, "/places/country-1/children?type=planet", "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("bad type status = %d, want 400", rec.Code)
	}

	// No children must serialise as [] not null.
	h.children = nil
	rec = do(t, srv, http.MethodGet, "/places/x/children", "")
	if !strings.Contains(rec.Body.String(), `"children":[]`) {
		t.Fatalf("empty children body = %s", rec.Body.String())
	}
}

func TestProminence(t *testing.T) {
	now := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	prom := &fakeProminence{p: ranking.Prominence{ClubID: "club-1", Prominence: 42.5, UpdatedAt: &now}, updated: 3}
	srv := newTestServer(t, Deps{Prominence: prom}, nil)

	rec := do(t, srv, http.MethodGet, "/prominence/club-1", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var body prominenceResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Prominence != 42.5 || body.UpdatedAt == nil || *body.UpdatedAt != "2026-01-02T03:04:05Z" {
		t.Fatalf("body = %+v", body)
	}

	prom.err = ranking.ErrClubNotFound
	rec = do(t, srv, http.MethodGet, "/prominence/missing", "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("not-found status = %d, want 404", rec.Code)
	}

	prom.err = nil
	rec = do(t, srv, http.MethodPost, "/prominence/recompute", `{"clubIds":["a","b"]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("recompute status = %d", rec.Code)
	}
	var out recomputeResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.Updated != 3 {
		t.Fatalf("updated = %d, want 3", out.Updated)
	}
}

func TestPyramidEndpoints(t *testing.T) {
	py := &fakePyramid{
		assignment: pyramid.Assignment{Pools: []pyramid.Pool{
			{Division: 1, RegionKey: "000000", CityKey: "000000", DistrictKey: "000000", ClubIDs: []string{"a", "b"}},
		}},
		join: pyramid.JoinResult{Division: 3, PoolID: strp("pool-1"), Slot: 4},
	}
	srv := newTestServer(t, Deps{Pyramid: py}, nil)

	rec := do(t, srv, http.MethodPost, "/pyramid/draw/comp-1", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("draw status = %d body %s", rec.Code, rec.Body.String())
	}
	var draw pyramidDrawResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &draw); err != nil {
		t.Fatal(err)
	}
	if len(draw.Pools) != 1 || len(draw.Pools[0].ClubIDs) != 2 {
		t.Fatalf("draw = %+v", draw)
	}

	rec = do(t, srv, http.MethodPost, "/pyramid/join", `{"competitionId":"comp-1","clubId":"club-1"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("join status = %d body %s", rec.Code, rec.Body.String())
	}
	var join pyramidJoinResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &join); err != nil {
		t.Fatal(err)
	}
	if join.Division != 3 || join.PoolID == nil || *join.PoolID != "pool-1" || join.Slot != 4 {
		t.Fatalf("join = %+v", join)
	}

	py.err = pyramid.ErrNoEdition
	rec = do(t, srv, http.MethodPost, "/pyramid/draw/comp-2", "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("no-edition status = %d, want 404", rec.Code)
	}
}

func TestTilesHandler(t *testing.T) {
	b := &fakeTiles{tile: tiles.Tile{
		Places: []tiles.PlaceMarker{{ID: "p1", Name: "Land 1", Type: "country", Clubs: 3}},
		Rev:    7,
	}}
	srv := newTestServer(t, Deps{Tiles: b}, nil)

	rec := do(t, srv, http.MethodGet, "/tiles/1/2/3", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("tile status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("ETag"); got != `"1/2/3:7"` {
		t.Fatalf("ETag = %q, want %q", got, `"1/2/3:7"`)
	}
	if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "max-age=15") {
		t.Fatalf("Cache-Control = %q", cc)
	}
	var body tiles.Tile
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode tile: %v", err)
	}
	if body.Key != (tiles.Key{Z: 1, X: 2, Y: 3}) || len(body.Places) != 1 {
		t.Fatalf("unexpected tile body: %+v", body)
	}

	// A matching If-None-Match revalidates to 304.
	r := httptest.NewRequest(http.MethodGet, "/tiles/1/2/3", nil)
	r.Header.Set("If-None-Match", `"1/2/3:7"`)
	rec2 := httptest.NewRecorder()
	srv.ServeHTTP(rec2, r)
	if rec2.Code != http.StatusNotModified {
		t.Fatalf("If-None-Match status = %d, want 304", rec2.Code)
	}

	// Zoom outside the scheme and non-integer cells are client errors.
	if rec := do(t, srv, http.MethodGet, "/tiles/9/0/0", ""); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad zoom = %d, want 400", rec.Code)
	}
	if rec := do(t, srv, http.MethodGet, "/tiles/x/0/0", ""); rec.Code != http.StatusBadRequest {
		t.Fatalf("non-integer z = %d, want 400", rec.Code)
	}
	// Unconfigured tiles answer 503, not a panic.
	if rec := do(t, newTestServer(t, Deps{}, nil), http.MethodGet, "/tiles/0/0/0", ""); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("unconfigured tiles = %d, want 503", rec.Code)
	}
}

func TestRoutes(t *testing.T) {
	srv := newTestServer(t, Deps{}, nil)
	if rec := do(t, srv, http.MethodGet, "/nope", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("unknown route = %d", rec.Code)
	}
	if rec := do(t, srv, http.MethodGet, "/health", ""); rec.Code != http.StatusOK {
		t.Fatalf("health GET = %d", rec.Code)
	}
	if rec := do(t, srv, http.MethodPost, "/health", ""); rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("health POST = %d, want 405", rec.Code)
	}
	// Unconfigured services answer 503, not a panic.
	if rec := do(t, srv, http.MethodPost, "/placement/spot", `{"clubId":"x"}`); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("unconfigured placement = %d, want 503", rec.Code)
	}
}
