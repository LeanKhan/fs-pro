package policy

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

type fakeAccess struct {
	admins   map[string]bool
	missing  map[string]bool // user ids that do not exist
	clubs    map[string]string
	players  map[string]string
	fixtures map[string][2]string
}

func (f *fakeAccess) IsAdmin(_ context.Context, userID string) (bool, bool, error) {
	if f.missing[userID] {
		return false, false, nil
	}
	return f.admins[userID], true, nil
}

func (f *fakeAccess) OwnsClub(_ context.Context, userID, clubID string) (Ownership, error) {
	if clubID == "" {
		return Missing, nil
	}
	owner, ok := f.clubs[clubID]
	if !ok {
		return Missing, nil
	}
	if owner == userID {
		return Yes, nil
	}
	return No, nil
}

func (f *fakeAccess) PlayerClub(_ context.Context, playerID string) (string, bool, error) {
	club, ok := f.players[playerID]
	return club, ok, nil
}

func (f *fakeAccess) FixtureTeams(_ context.Context, fixtureID string) (string, string, bool, error) {
	fx, ok := f.fixtures[fixtureID]
	if !ok {
		return "", "", false, nil
	}
	return fx[0], fx[1], true, nil
}

func baseRequest(userID string) Request {
	return Request{
		Method: http.MethodPost,
		UserID: userID,
		Param:  func(string) string { return "" },
		Query:  url.Values{},
	}
}

func withParam(name, value string) func(string) string {
	return func(n string) string {
		if n == name {
			return value
		}
		return ""
	}
}

func decide(t *testing.T, rule Rule, req Request, access Access) Decision {
	t.Helper()
	return Enforce(context.Background(), rule, req, access)
}

func TestPublicAndHandlerAccess(t *testing.T) {
	access := &fakeAccess{}
	if d := decide(t, Rule{Kind: Public}, baseRequest(""), access); !d.Allowed {
		t.Fatalf("public should be allowed anonymously, got %+v", d)
	}
	// Handler routes check owner/admin themselves, but the guard requires a
	// signed-in user: anonymous must never reach one (D1).
	if d := decide(t, Rule{Kind: Handler}, baseRequest(""), access); d.Allowed || d.Status != 401 || d.Message != "Not logged in" {
		t.Fatalf("handler must require sign-in, got %+v", d)
	}
	if d := decide(t, Rule{Kind: Handler}, baseRequest("u1"), access); !d.Allowed {
		t.Fatalf("signed-in handler should be allowed by the guard, got %+v", d)
	}
}

// TestEveryHandlerRuleDeniesAnonymous walks the whole policy table: no
// handler-rule route may be reachable anonymously. If a future change makes
// Handler a blanket allow, this fails.
func TestEveryHandlerRuleDeniesAnonymous(t *testing.T) {
	access := &fakeAccess{}
	checked := 0
	for id, rule := range Table {
		if rule.Kind != Handler || IsPublicHandler(id) {
			continue
		}
		checked++
		d := decide(t, rule, baseRequest(""), access)
		if d.Allowed || d.Status != 401 || d.Message != "Not logged in" {
			t.Fatalf("handler route %s allowed anonymous: %+v", id, d)
		}
	}
	if checked < 30 {
		t.Fatalf("expected many handler routes, walked %d", checked)
	}
}

func TestSignedInRequiresUser(t *testing.T) {
	access := &fakeAccess{}
	if d := decide(t, Rule{Kind: SignedIn}, baseRequest(""), access); d.Allowed || d.Status != 401 || d.Message != "Not logged in" {
		t.Fatalf("anonymous signedIn = %+v", d)
	}
	if d := decide(t, Rule{Kind: SignedIn}, baseRequest("u1"), access); !d.Allowed {
		t.Fatalf("signed-in should be allowed, got %+v", d)
	}
}

func TestAdminRule(t *testing.T) {
	access := &fakeAccess{admins: map[string]bool{"boss": true}, missing: map[string]bool{"ghost": true}}
	if d := decide(t, Rule{Kind: Admin}, baseRequest("boss"), access); !d.Allowed {
		t.Fatalf("admin should be allowed, got %+v", d)
	}
	if d := decide(t, Rule{Kind: Admin}, baseRequest("user"), access); d.Status != 403 || d.Message != "Admins only" {
		t.Fatalf("non-admin = %+v", d)
	}
	if d := decide(t, Rule{Kind: Admin}, baseRequest("ghost"), access); d.Status != 401 || d.Message != "Not logged in" {
		t.Fatalf("missing user = %+v", d)
	}
}

func TestSelfRule(t *testing.T) {
	access := &fakeAccess{}
	other := baseRequest("u1")
	other.Param = withParam("id", "u2")
	if d := decide(t, Rule{Kind: Self, Param: "id"}, other, access); d.Status != 403 || d.Message != "That is not your account" {
		t.Fatalf("self mismatch = %+v", d)
	}
	own := baseRequest("u1")
	own.Param = withParam("id", "u1")
	d := decide(t, Rule{Kind: Self, Param: "id", Fields: []string{"FullName"}}, own, access)
	if !d.Allowed || len(d.Keep) != 1 || d.Keep[0] != "FullName" {
		t.Fatalf("self own = %+v", d)
	}
}

func TestClubRule(t *testing.T) {
	access := &fakeAccess{clubs: map[string]string{"c1": "u1", "c2": "u2"}}
	missing := baseRequest("u1")
	missing.Param = withParam("id", "nope")
	if d := decide(t, Rule{Kind: Club, Source: SourceParam, Field: "id"}, missing, access); d.Status != 404 || d.Message != "Club not found" {
		t.Fatalf("club missing = %+v", d)
	}
	notOwner := baseRequest("u1")
	notOwner.Param = withParam("id", "c2")
	if d := decide(t, Rule{Kind: Club, Source: SourceParam, Field: "id"}, notOwner, access); d.Status != 403 || d.Message != "You do not manage this club" {
		t.Fatalf("club not owner = %+v", d)
	}
	owner := baseRequest("u1")
	owner.Param = withParam("id", "c1")
	d := decide(t, Rule{Kind: Club, Source: SourceParam, Field: "id", Fields: []string{"Tactic"}}, owner, access)
	if !d.Allowed || len(d.Keep) != 1 {
		t.Fatalf("club owner = %+v", d)
	}
}

func TestClubRuleBodyAndQuerySources(t *testing.T) {
	access := &fakeAccess{clubs: map[string]string{"c1": "u1"}}
	body := baseRequest("u1")
	body.Body = map[string]any{"clubId": "c1"}
	if d := decide(t, Rule{Kind: Club, Source: SourceBody, Field: "clubId"}, body, access); !d.Allowed {
		t.Fatalf("club by body field = %+v", d)
	}
	query := baseRequest("u1")
	query.Query = url.Values{"clubId": {"c1"}}
	if d := decide(t, Rule{Kind: Club, Source: SourceQuery, Field: "clubId"}, query, access); !d.Allowed {
		t.Fatalf("club by query field = %+v", d)
	}
}

func TestPlayerRule(t *testing.T) {
	access := &fakeAccess{clubs: map[string]string{"c1": "u1", "c2": "u2"}, players: map[string]string{"p1": "c1", "p2": "c2"}}
	missing := baseRequest("u1")
	missing.Param = withParam("id", "nope")
	if d := decide(t, Rule{Kind: Player, Param: "id"}, missing, access); d.Status != 404 || d.Message != "Player not found" {
		t.Fatalf("player missing = %+v", d)
	}
	other := baseRequest("u1")
	other.Param = withParam("id", "p2")
	if d := decide(t, Rule{Kind: Player, Param: "id"}, other, access); d.Status != 403 || d.Message != "That player is not at your club" {
		t.Fatalf("player other club = %+v", d)
	}
	own := baseRequest("u1")
	own.Param = withParam("id", "p1")
	if d := decide(t, Rule{Kind: Player, Param: "id", Fields: []string{"TrainingFocus"}}, own, access); !d.Allowed {
		t.Fatalf("player own = %+v", d)
	}
}

func TestFixtureRule(t *testing.T) {
	access := &fakeAccess{clubs: map[string]string{"c1": "u1", "c2": "u2", "c3": "u3"},
		fixtures: map[string][2]string{"f1": {"c1", "c2"}, "f2": {"c2", "c3"}}}

	flag := baseRequest("u1")
	flag.Param = withParam("fixture", "f1")
	flag.Query = url.Values{"simulate_rest": {"1"}}
	d := decide(t, Rule{Kind: Fixture, Param: "fixture", AdminQuery: []string{"simulate_rest"}}, flag, access)
	if d.Status != 403 || d.Message != "simulate_rest is for admins only" {
		t.Fatalf("admin flag = %+v", d)
	}
	flagFalse := baseRequest("u1")
	flagFalse.Param = withParam("fixture", "f1")
	flagFalse.Query = url.Values{"simulate_rest": {"false"}}
	if d := decide(t, Rule{Kind: Fixture, Param: "fixture", AdminQuery: []string{"simulate_rest"}}, flagFalse, access); !d.Allowed {
		t.Fatalf("flag=false should be allowed: %+v", d)
	}
	missing := baseRequest("u1")
	missing.Param = withParam("fixture", "nope")
	if d := decide(t, Rule{Kind: Fixture, Param: "fixture"}, missing, access); d.Status != 404 || d.Message != "Fixture not found" {
		t.Fatalf("fixture missing = %+v", d)
	}
	notPlaying := baseRequest("u3")
	notPlaying.Param = withParam("fixture", "f1")
	if d := decide(t, Rule{Kind: Fixture, Param: "fixture"}, notPlaying, access); d.Status != 403 || d.Message != "You are not playing in this match" {
		t.Fatalf("not playing = %+v", d)
	}
	playing := baseRequest("u2")
	playing.Param = withParam("fixture", "f1")
	if d := decide(t, Rule{Kind: Fixture, Param: "fixture"}, playing, access); !d.Allowed {
		t.Fatalf("away owner should be allowed: %+v", d)
	}
}

func TestAdminBypassesEveryRuleKind(t *testing.T) {
	access := &fakeAccess{admins: map[string]bool{"boss": true}}
	req := baseRequest("boss")
	req.Param = withParam("id", "someone-else")
	req.Body = map[string]any{"clubId": "someone-elses-club"}
	req.Query = url.Values{"clubId": {"someone-elses-club"}, "simulate_rest": {"1"}}

	rules := []Rule{
		{Kind: Admin},
		{Kind: Self, Param: "id", Fields: []string{"FullName"}},
		{Kind: Club, Source: SourceParam, Field: "id", Fields: []string{"Tactic"}},
		{Kind: Club, Source: SourceBody, Field: "clubId"},
		{Kind: Club, Source: SourceQuery, Field: "clubId"},
		{Kind: Player, Param: "id", Fields: []string{"TrainingFocus"}},
		{Kind: Fixture, Param: "fixture", AdminQuery: []string{"simulate_rest"}},
	}
	for _, rule := range rules {
		d := decide(t, rule, req, access)
		if !d.Allowed {
			t.Fatalf("admin must pass rule %+v, got %+v", rule, d)
		}
		if len(d.Keep) != 0 {
			t.Fatalf("admin must not be field-stripped by rule %+v, got Keep=%v", rule, d.Keep)
		}
	}
}

func TestAdminBypassOwnAccount(t *testing.T) {
	access := &fakeAccess{admins: map[string]bool{"boss": true}}
	own := baseRequest("boss")
	own.Param = withParam("id", "boss")
	d := decide(t, Rule{Kind: Self, Param: "id", Fields: []string{"FullName"}}, own, access)
	if !d.Allowed || len(d.Keep) != 0 {
		t.Fatalf("admin self update must be unnarrowed, got %+v", d)
	}
}

func TestDefaultsForUnlistedRoutes(t *testing.T) {
	if r := RuleFor("unknown.get", http.MethodGet); r.Kind != Public {
		t.Fatalf("unlisted GET should be public, got %+v", r)
	}
	if r := RuleFor("unknown.post", http.MethodPost); r.Kind != Admin {
		t.Fatalf("unlisted non-GET should be admin, got %+v", r)
	}
}

func TestTableMatchesNodePolicies(t *testing.T) {
	// Spot-check the exact rules the users surface depends on.
	checks := map[string]Kind{
		"users.joinUser":             Public,
		"users.loginUser":            Public,
		"users.enterSession":         Public,
		"users.changePassword":       SignedIn,
		"users.requestPasswordReset": Public,
		"users.resetPassword":        Public,
		"users.verifyEmail":          Public,
		"users.resendVerification":   SignedIn,
		"users.setEmail":             SignedIn,
		"users.logoutUser":           Self,
		"users.updateUser":           Self,
		"users.addClubsToUser":       Admin,
		"users.addClubToUser":        Admin,
		"users.removeClubFromUser":   Self,
	}
	for id, kind := range checks {
		if got := Table[id].Kind; got != kind {
			t.Fatalf("%s kind = %d, want %d", id, got, kind)
		}
	}
	fields := strings.Join(Table["users.updateUser"].Fields, ",")
	if fields != "FullName,Avatar,Age,Alerts" {
		t.Fatalf("updateUser fields = %q", fields)
	}
}

func TestKeepFields(t *testing.T) {
	body := map[string]any{"FullName": "Ada", "Password": "x", "isAdmin": true, "Alerts": nil}
	KeepFields(body, []string{"FullName", "Avatar", "Age", "Alerts"})
	if _, ok := body["Password"]; ok {
		t.Fatal("Password must be removed")
	}
	if _, ok := body["isAdmin"]; ok {
		t.Fatal("isAdmin must be removed")
	}
	if body["FullName"] != "Ada" {
		t.Fatal("FullName must be kept")
	}
	if _, ok := body["Alerts"]; !ok {
		t.Fatal("Alerts must be kept even when nil")
	}
	// No fields means no filtering.
	body2 := map[string]any{"Anything": 1}
	KeepFields(body2, nil)
	if len(body2) != 1 {
		t.Fatal("empty fields must not filter")
	}
}
