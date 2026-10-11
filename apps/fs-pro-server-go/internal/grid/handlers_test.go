package grid

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"fs-pro-server/internal/config"
	"fs-pro-server/internal/httpapi"
	"fs-pro-server/internal/session"
)

// fakeClubs is an in-memory ClubReader.
type fakeClubs struct {
	profiles map[string]ClubProfile
	forUser  map[string]string
	err      error
}

func (f fakeClubs) Profile(_ context.Context, id string) (ClubProfile, bool, error) {
	if f.err != nil {
		return ClubProfile{}, false, f.err
	}
	p, ok := f.profiles[id]
	return p, ok, nil
}

func (f fakeClubs) ClubForUser(_ context.Context, userID string) (string, bool, error) {
	if f.err != nil {
		return "", false, f.err
	}
	id, ok := f.forUser[userID]
	return id, ok, nil
}

// fakeOwnership authorises a fixed set of (user, club) pairs.
type fakeOwnership struct {
	allowed map[string]bool // key: userID + "/" + clubID
	admins  map[string]bool
}

func (f fakeOwnership) CanManage(_ context.Context, userID, clubID string) (int, string) {
	if userID == "" {
		return 401, "Not logged in"
	}
	if f.admins[userID] || f.allowed[userID+"/"+clubID] {
		return 0, ""
	}
	return 403, "You do not manage this club"
}

func newTestHandlers(tier int) *Handlers {
	return New(NewService(NewMemoryRepository()),
		fakeClubs{
			profiles: map[string]ClubProfile{
				"c1": {ID: "c1", Name: "One", Code: "ONE", ClubhouseTier: tier},
				"c2": {ID: "c2", Name: "Two", Code: "TWO", ClubhouseTier: tier},
			},
			forUser: map[string]string{"user-1": "c1"},
		},
		fakeOwnership{allowed: map[string]bool{"user-1/c1": true, "user-1/c2": true}},
	)
}

// request builds a handler request with the given path values.
func request(pathValues map[string]string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "/", nil)
	for k, v := range pathValues {
		r.SetPathValue(k, v)
	}
	return r
}

func invoke(t *testing.T, h func(*httpapi.Context, http.ResponseWriter, *http.Request) httpapi.Response, pathValues map[string]string, body any) httpapi.Response {
	return invokeAs(t, "user-1", h, pathValues, body)
}

func invokeAs(t *testing.T, userID string, h func(*httpapi.Context, http.ResponseWriter, *http.Request) httpapi.Response, pathValues map[string]string, body any) httpapi.Response {
	t.Helper()
	cx := httpapi.NewContext(nil)
	if userID != "" {
		cx.Session = &session.State{Data: map[string]any{"userID": userID}}
	}
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
		cx.Body = raw
	}
	return h(cx, httptest.NewRecorder(), request(pathValues))
}

func payloadOf(t *testing.T, resp httpapi.Response) map[string]any {
	t.Helper()
	raw, ok := resp.Body["payload"].(map[string]any)
	if !ok {
		t.Fatalf("response has no object payload: %#v", resp.Body)
	}
	return raw
}

func TestGetLayoutsEmptyThenMissing(t *testing.T) {
	h := newTestHandlers(3)

	resp := h.getLayouts(httpapi.NewContext(nil), httptest.NewRecorder(), request(map[string]string{"id": "c1"}))
	if resp.Status != 200 {
		t.Fatalf("status = %d, want 200", resp.Status)
	}
	if p := payloadOf(t, resp); intField(p["tier"]) != 3 {
		t.Errorf("tier = %v, want 3", p["tier"])
	}

	missing := h.getLayouts(httpapi.NewContext(nil), httptest.NewRecorder(), request(map[string]string{"id": "nope"}))
	if missing.Status != 404 {
		t.Errorf("missing club status = %d, want 404", missing.Status)
	}
}

func TestPutThenGetLayout(t *testing.T) {
	h := newTestHandlers(1)
	body := map[string]any{"grid": validGrid()}

	put := invoke(t, h.putLayout, map[string]string{"id": "c1", "slot": "home"}, body)
	if put.Status != 200 {
		t.Fatalf("put status = %d body %#v", put.Status, put.Body)
	}

	get := invoke(t, h.getLayout, map[string]string{"id": "c1", "slot": "home"}, nil)
	if get.Status != 200 {
		t.Fatalf("get status = %d", get.Status)
	}
	got, ok := payloadOf(t, get)["grid"].(Grid)
	if !ok || len(got.Slots) != Starters {
		t.Errorf("round-tripped grid = %#v, want %d slots", payloadOf(t, get)["grid"], Starters)
	}

	empty := invoke(t, h.getLayout, map[string]string{"id": "c1", "slot": "derby"}, nil)
	if empty.Status != 404 {
		t.Errorf("empty slot status = %d, want 404", empty.Status)
	}
	badSlot := invoke(t, h.getLayout, map[string]string{"id": "c1", "slot": "away"}, nil)
	if badSlot.Status != 400 {
		t.Errorf("unknown slot status = %d, want 400", badSlot.Status)
	}
}

func TestPutLayoutRejectsInvalidWithExactReason(t *testing.T) {
	h := newTestHandlers(1)
	g := validGrid()
	g.Slots = g.Slots[:10]
	want := Validate(g, 1)

	resp := invoke(t, h.putLayout, map[string]string{"id": "c1", "slot": "home"}, map[string]any{"grid": g})
	if resp.Status != 400 {
		t.Fatalf("status = %d, want 400", resp.Status)
	}
	if msg := resp.Body["message"]; msg != want {
		t.Errorf("message = %v, want the exact Validate reason %q", msg, want)
	}
}

func TestPutLayoutRejectsUnknownSlotAndMissingBody(t *testing.T) {
	h := newTestHandlers(1)
	bad := invoke(t, h.putLayout, map[string]string{"id": "c1", "slot": "keeper"}, map[string]any{"grid": validGrid()})
	if bad.Status != 400 {
		t.Errorf("unknown slot status = %d, want 400", bad.Status)
	}
	missing := invoke(t, h.putLayout, map[string]string{"id": "c1", "slot": "home"}, nil)
	if missing.Status != 400 {
		t.Errorf("missing body status = %d, want 400", missing.Status)
	}
}

func TestValidateLayout(t *testing.T) {
	h := newTestHandlers(1)

	ok := invoke(t, h.validateLayout, map[string]string{"id": "c1"}, map[string]any{"grid": validGrid()})
	if ok.Status != 200 {
		t.Fatalf("valid status = %d", ok.Status)
	}
	if p := payloadOf(t, ok); p["valid"] != true || p["reason"] != nil {
		t.Errorf("valid payload = %#v", p)
	}

	g := validGrid()
	g.Slots[8].Col = 5 // locked at tier 1
	bad := invoke(t, h.validateLayout, map[string]string{"id": "c1"}, map[string]any{"grid": g})
	if p := payloadOf(t, bad); p["valid"] != false || p["reason"] == nil {
		t.Errorf("invalid payload = %#v", p)
	}
}

func TestPublishImportRoundTrip(t *testing.T) {
	h := newTestHandlers(2)
	if resp := invoke(t, h.putLayout, map[string]string{"id": "c1", "slot": "home"}, map[string]any{"grid": validGrid()}); resp.Status != 200 {
		t.Fatalf("put: %d", resp.Status)
	}

	pub := invoke(t, h.publishLayout, map[string]string{"id": "c1", "slot": "home"}, nil)
	if pub.Status != 200 {
		t.Fatalf("publish status = %d body %#v", pub.Status, pub.Body)
	}
	code, _ := payloadOf(t, pub)["code"].(string)
	if !ValidShareCode(code) {
		t.Fatalf("published code %q is malformed", code)
	}

	imp := invoke(t, h.importLayout, nil, map[string]any{"code": code, "clubId": "c2", "slot": "match"})
	if imp.Status != 200 {
		t.Fatalf("import status = %d body %#v", imp.Status, imp.Body)
	}
	if g, ok := payloadOf(t, imp)["grid"].(Grid); !ok || len(g.Slots) != Starters {
		t.Errorf("imported grid = %#v, want %d slots", payloadOf(t, imp)["grid"], Starters)
	}

	// The code is unknown after a made-up code, and malformed codes are refused.
	unknown := invoke(t, h.importLayout, nil, map[string]any{"code": "FSG-22222222", "clubId": "c2", "slot": "match"})
	if unknown.Status != 404 {
		t.Errorf("unknown code status = %d, want 404", unknown.Status)
	}
	malformed := invoke(t, h.importLayout, nil, map[string]any{"code": "nope", "clubId": "c2", "slot": "match"})
	if malformed.Status != 400 {
		t.Errorf("malformed code status = %d, want 400", malformed.Status)
	}
}

// TestImportAppliesImporterTierGate proves a shared shape cannot bypass the
// importing club's Clubhouse gate (server-authoritative).
func TestImportAppliesImporterTierGate(t *testing.T) {
	publisher := newTestHandlers(5)
	g := validGrid()
	g.Slots[8].Col = 8 // X8: legal at tier 5 only
	if resp := invoke(t, publisher.putLayout, map[string]string{"id": "c1", "slot": "home"}, map[string]any{"grid": g}); resp.Status != 200 {
		t.Fatalf("put: %d %#v", resp.Status, resp.Body)
	}
	pub := invoke(t, publisher.publishLayout, map[string]string{"id": "c1", "slot": "home"}, nil)
	code := payloadOf(t, pub)["code"].(string)

	// A tier-1 club cannot import that high shape.
	importer := New(publisher.svc, fakeClubs{
		profiles: map[string]ClubProfile{"c2": {ID: "c2", ClubhouseTier: 1}},
		forUser:  map[string]string{"user-1": "c2"},
	}, fakeOwnership{allowed: map[string]bool{"user-1/c2": true}})
	resp := invoke(t, importer.importLayout, nil, map[string]any{"code": code, "clubId": "c2", "slot": "home"})
	if resp.Status != 400 {
		t.Fatalf("tier-gated import status = %d, want 400", resp.Status)
	}
}

// TestImportIsScopedToTheCallersClub proves the share-code import cannot target
// a club the caller does not manage (the route policy is SignedIn, not a club
// rule), and that omitting the club resolves the caller's own club.
func TestImportIsScopedToTheCallersClub(t *testing.T) {
	h := newTestHandlers(2)
	if resp := invoke(t, h.putLayout, map[string]string{"id": "c1", "slot": "home"}, map[string]any{"grid": validGrid()}); resp.Status != 200 {
		t.Fatalf("put: %d", resp.Status)
	}
	pub := invoke(t, h.publishLayout, map[string]string{"id": "c1", "slot": "home"}, nil)
	code := payloadOf(t, pub)["code"].(string)

	// Targeting c2 without owning it is refused as 404 (hidden), staying inside
	// the route's declared status set.
	foreign := New(h.svc, fakeClubs{
		profiles: map[string]ClubProfile{"c2": {ID: "c2", ClubhouseTier: 5}},
	}, fakeOwnership{})
	if resp := invoke(t, foreign.importLayout, nil, map[string]any{"code": code, "clubId": "c2", "slot": "home"}); resp.Status != 404 {
		t.Errorf("import into a foreign club = %d, want 404", resp.Status)
	}

	// Omitting the club imports into the caller's own club.
	own := New(h.svc, fakeClubs{
		profiles: map[string]ClubProfile{"c1": {ID: "c1", ClubhouseTier: 2}},
		forUser:  map[string]string{"user-1": "c1"},
	}, fakeOwnership{allowed: map[string]bool{"user-1/c1": true}})
	resp := invoke(t, own.importLayout, nil, map[string]any{"code": code, "slot": "match"})
	if resp.Status != 200 {
		t.Fatalf("session-scoped import = %d body %#v, want 200", resp.Status, resp.Body)
	}
}

func TestPublishEmptySlotIs404(t *testing.T) {
	h := newTestHandlers(1)
	resp := invoke(t, h.publishLayout, map[string]string{"id": "c1", "slot": "home"}, nil)
	if resp.Status != 404 {
		t.Errorf("publishing an empty slot = %d, want 404", resp.Status)
	}
}

// TestRegisterWiresFixedRoutes pins the route ids, methods, paths and statuses
// the orchestrator's main.go registration relies on.
func TestRegisterWiresFixedRoutes(t *testing.T) {
	srv := httpapi.New(httpapi.Deps{Config: config.Config{LogLevel: "error", RateLimitOff: true}})
	Register(srv, newTestHandlers(1))

	want := map[string]httpapi.RouteInfo{
		"grid.getLayouts":     {ID: "grid.getLayouts", Method: "GET", Path: "/api/clubs/{id}/layouts", Statuses: []int{200, 404}},
		"grid.getLayout":      {ID: "grid.getLayout", Method: "GET", Path: "/api/clubs/{id}/layouts/{slot}", Statuses: []int{200, 400, 404}},
		"grid.putLayout":      {ID: "grid.putLayout", Method: "PUT", Path: "/api/clubs/{id}/layouts/{slot}", Statuses: []int{200, 400, 401, 403, 404}},
		"grid.validateLayout": {ID: "grid.validateLayout", Method: "POST", Path: "/api/clubs/{id}/layouts/validate", Statuses: []int{200, 400, 404}},
		"grid.publishLayout":  {ID: "grid.publishLayout", Method: "POST", Path: "/api/clubs/{id}/layouts/{slot}/publish", Statuses: []int{200, 400, 401, 403, 404}},
		"grid.importLayout":   {ID: "grid.importLayout", Method: "POST", Path: "/api/layouts/import", Statuses: []int{200, 400, 401, 404}},
	}
	seen := map[string]httpapi.RouteInfo{}
	for _, r := range srv.Routes() {
		seen[r.ID] = r
	}
	for id, w := range want {
		got, ok := seen[id]
		if !ok {
			t.Fatalf("route %s not registered", id)
		}
		if got.Method != w.Method || got.Path != w.Path {
			t.Errorf("%s = %s %s, want %s %s", id, got.Method, got.Path, w.Method, w.Path)
		}
		if len(got.Statuses) != len(w.Statuses) {
			t.Fatalf("%s statuses = %v, want %v", id, got.Statuses, w.Statuses)
		}
		for i := range w.Statuses {
			if got.Statuses[i] != w.Statuses[i] {
				t.Errorf("%s status[%d] = %d, want %d", id, i, got.Statuses[i], w.Statuses[i])
			}
		}
	}
}
