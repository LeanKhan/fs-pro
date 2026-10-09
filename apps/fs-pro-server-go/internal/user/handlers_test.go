package user

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"fs-pro-server/internal/auth"
	"fs-pro-server/internal/config"
	"fs-pro-server/internal/httpapi"
	"fs-pro-server/internal/mail"
	"fs-pro-server/internal/meta"
	"fs-pro-server/internal/policy"
	"fs-pro-server/internal/session"
)

const testSecret = "test-secret"

// --- fakes -----------------------------------------------------------------

type fakeUsers struct {
	byID       map[string]map[string]any
	byUsername map[string]map[string]any
	byEmail    map[string]map[string]any
	createErr  error
	updated    map[string]any
	updatedID  string
	created    map[string]any
}

func (f *fakeUsers) FindByID(_ context.Context, id string) (map[string]any, error) {
	return f.byID[id], nil
}
func (f *fakeUsers) FindByUsername(_ context.Context, username string) (map[string]any, error) {
	return f.byUsername[username], nil
}
func (f *fakeUsers) FindByEmail(_ context.Context, email string) (map[string]any, error) {
	return f.byEmail[email], nil
}
func (f *fakeUsers) Create(_ context.Context, data map[string]any) (map[string]any, error) {
	if f.createErr != nil {
		return nil, f.createErr
	}
	row := map[string]any{"_id": "u-new", "isAdmin": false, "EmailVerifiedAt": nil}
	for k, v := range data {
		row[k] = v
	}
	f.created = row
	if f.byID == nil {
		f.byID = map[string]map[string]any{}
	}
	f.byID["u-new"] = row
	return row, nil
}
func (f *fakeUsers) Update(_ context.Context, id string, data map[string]any) (map[string]any, error) {
	f.updated = data
	f.updatedID = id
	row := f.byID[id]
	if row == nil {
		row = map[string]any{"_id": id}
	}
	for k, v := range data {
		row[k] = v
	}
	f.byID[id] = row
	return row, nil
}

type fakeClubs struct{ byID map[string]map[string]any }

func (f *fakeClubs) FindByUserID(_ context.Context, userID string) ([]map[string]any, error) {
	out := []map[string]any{}
	for _, c := range f.byID {
		if c["UserId"] == userID {
			out = append(out, c)
		}
	}
	return out, nil
}
func (f *fakeClubs) Update(_ context.Context, id string, data map[string]any) (map[string]any, error) {
	row := f.byID[id]
	if row == nil {
		row = map[string]any{"_id": id}
	}
	for k, v := range data {
		row[k] = v
	}
	f.byID[id] = row
	return row, nil
}
func (f *fakeClubs) SetOwner(_ context.Context, id, userID string) (map[string]any, error) {
	var owner any
	if userID != "" {
		owner = userID
	}
	return f.Update(nil, id, map[string]any{"UserId": owner})
}

type fakeTokens struct {
	mu          sync.Mutex
	consumeUser string
	consumeOK   bool
	issued      []auth.TokenKind
}

func (f *fakeTokens) Issue(_ context.Context, _ string, kind auth.TokenKind) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.issued = append(f.issued, kind)
	return "token-" + string(kind), nil
}
func (f *fakeTokens) Consume(_ context.Context, _ string, _ auth.TokenKind) (string, bool, error) {
	return f.consumeUser, f.consumeOK, nil
}

type fakeMailer struct {
	mu    sync.Mutex
	sent  []mail.Mail
	delay time.Duration
	fail  bool
}

func (f *fakeMailer) Send(_ context.Context, m mail.Mail) bool {
	if f.delay > 0 {
		time.Sleep(f.delay)
	}
	if f.fail {
		return false
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sent = append(f.sent, m)
	return true
}

func (f *fakeMailer) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.sent)
}

type fakeStore struct {
	data    map[string]map[string]any
	deleted []string
}

func newFakeStore() *fakeStore { return &fakeStore{data: map[string]map[string]any{}} }

func (f *fakeStore) Get(_ context.Context, sid string) (map[string]any, error) {
	return f.data[sid], nil
}
func (f *fakeStore) Set(_ context.Context, sid string, data map[string]any) error {
	f.data[sid] = data
	return nil
}
func (f *fakeStore) Destroy(_ context.Context, sid string) error {
	delete(f.data, sid)
	f.deleted = append(f.deleted, sid)
	return nil
}
func (f *fakeStore) Touch(_ context.Context, _ string, _ time.Time) error { return nil }
func (f *fakeStore) DeleteByUserID(_ context.Context, userID string) error {
	for sid, s := range f.data {
		if s["userID"] == userID {
			delete(f.data, sid)
		}
	}
	return nil
}

type fakeAccess struct{}

func (fakeAccess) IsAdmin(_ context.Context, userID string) (bool, bool, error) {
	return userID == "admin", true, nil
}
func (fakeAccess) OwnsClub(context.Context, string, string) (policy.Ownership, error) {
	return policy.Yes, nil
}
func (fakeAccess) PlayerClub(context.Context, string) (string, bool, error) { return "", false, nil }
func (fakeAccess) FixtureTeams(context.Context, string) (string, string, bool, error) {
	return "", "", false, nil
}

type env struct {
	handler http.Handler
	srv     *httpapi.Server
	users   *fakeUsers
	clubs   *fakeClubs
	tokens  *fakeTokens
	store   *fakeStore
	mailer  *fakeMailer
}

func newEnv(t *testing.T) *env {
	t.Helper()
	e := &env{
		users:  &fakeUsers{byID: map[string]map[string]any{}, byUsername: map[string]map[string]any{}, byEmail: map[string]map[string]any{}},
		clubs:  &fakeClubs{byID: map[string]map[string]any{}},
		tokens: &fakeTokens{},
		store:  newFakeStore(),
		mailer: &fakeMailer{},
	}
	cfg := config.Config{Port: "3000", SessionSecret: testSecret, LogLevel: "error", RateLimitOff: true}
	manager := session.NewManager(e.store, testSecret, false, time.Hour)
	srv := httpapi.New(httpapi.Deps{Config: cfg, Session: manager, Access: fakeAccess{}})
	meta.Register(srv)
	Register(srv, New(Deps{
		Users:    e.users,
		Clubs:    e.clubs,
		Tokens:   e.tokens,
		Sessions: manager,
		Mail:     e.mailer,
	}))
	e.handler = srv.Handler()
	e.srv = srv
	return e
}

func (e *env) do(method, path, body string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest(method, path, strings.NewReader(body)).WithContext(ctx)
	req.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	e.handler.ServeHTTP(rec, req)
	// net/http cancels the request context the moment ServeHTTP returns; do the
	// same so fire-and-forget work that used it would be caught.
	cancel()
	return rec
}

func waitFor(t *testing.T, timeout time.Duration, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("condition not met within timeout")
}

func cookieFor(sid string) *http.Cookie {
	return &http.Cookie{Name: session.CookieName, Value: session.Sign(sid, testSecret)}
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatalf("bad JSON (%v): %s", err, rec.Body.String())
	}
	return m
}

func payload(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	body := decode(t, rec)
	p, ok := body["payload"].(map[string]any)
	if !ok {
		t.Fatalf("no object payload: %s", rec.Body.String())
	}
	return p
}

// --- tests -----------------------------------------------------------------

func TestJoinSetsSessionAndUserSession(t *testing.T) {
	e := newEnv(t)
	rec := e.do(http.MethodPost, "/api/users/join",
		`{"FullName":"Ada","Username":"ada","Password":"password1","Email":"Ada@Example.com"}`)
	if rec.Code != 200 {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	p := payload(t, rec)
	if p["_id"] != "u-new" {
		t.Fatalf("payload _id = %v", p["_id"])
	}
	if _, ok := p["Password"]; ok {
		t.Fatal("Password must not cross the wire")
	}
	if p["EmailVerified"] != false {
		t.Fatalf("EmailVerified = %v", p["EmailVerified"])
	}
	if e.users.created["Email"] != "ada@example.com" {
		t.Fatalf("email should be normalized, got %v", e.users.created["Email"])
	}
	if len(e.store.data) != 1 {
		t.Fatalf("expected one stored session, got %d", len(e.store.data))
	}
	for _, s := range e.store.data {
		if s["userID"] != "u-new" {
			t.Fatalf("stored session userID = %v", s["userID"])
		}
	}
	sid := e.users.updated["Session"]
	if sid == "" || sid == nil {
		t.Fatal("Users.Session must be set")
	}
	cookies := rec.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("expected a Set-Cookie")
	}
	if got, ok := session.Unsign(cookies[0].Value, testSecret); !ok || got != sid {
		t.Fatalf("Set-Cookie sid = %q ok=%v, user.Session = %v", got, ok, sid)
	}
}

func TestJoinValidation(t *testing.T) {
	e := newEnv(t)
	rec := e.do(http.MethodPost, "/api/users/join",
		`{"FullName":"Ada","Username":"a","Password":"password1","Email":"ada@example.com"}`)
	if rec.Code != 400 {
		t.Fatalf("status = %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "Usernames are 3-24 letters") {
		t.Fatalf("unexpected message: %s", rec.Body.String())
	}
}

func TestJoinValidationMessages(t *testing.T) {
	cases := []struct {
		name string
		body string
		want string
	}{
		{"username", `{"FullName":"Ada","Username":"a","Password":"password1","Email":"a@b.com"}`, "Usernames are 3-24 letters"},
		{"password", `{"FullName":"Ada","Username":"ada","Password":"short","Email":"a@b.com"}`, "at least 8 characters"},
		{"name", `{"FullName":"   ","Username":"ada","Password":"password1","Email":"a@b.com"}`, "Tell us your name"},
		{"email", `{"FullName":"Ada","Username":"ada","Password":"password1","Email":"nope"}`, "Enter a valid email address"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := newEnv(t).do(http.MethodPost, "/api/users/join", tc.body)
			if rec.Code != 400 || !strings.Contains(rec.Body.String(), tc.want) {
				t.Fatalf("status = %d body = %s (want %q)", rec.Code, rec.Body.String(), tc.want)
			}
		})
	}
}

func TestJoinDuplicateEmail(t *testing.T) {
	e := newEnv(t)
	e.users.createErr = &auth.ConflictError{Email: true}
	rec := e.do(http.MethodPost, "/api/users/join",
		`{"FullName":"Ada","Username":"ada","Password":"password1","Email":"ada@example.com"}`)
	if rec.Code != 400 || !strings.Contains(rec.Body.String(), "That email is already used by another account") {
		t.Fatalf("duplicate email = %d %s", rec.Code, rec.Body.String())
	}
}

// D5 regression: join must not block on the verification mailer.
func TestJoinDoesNotBlockOnSlowMailer(t *testing.T) {
	e := newEnv(t)
	e.mailer.delay = 500 * time.Millisecond
	e.mailer.fail = true
	start := time.Now()
	rec := e.do(http.MethodPost, "/api/users/join",
		`{"FullName":"Ada","Username":"ada","Password":"password1","Email":"ada@example.com"}`)
	elapsed := time.Since(start)
	if rec.Code != 200 {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
	if elapsed > 250*time.Millisecond {
		t.Fatalf("join blocked on the mailer for %s", elapsed)
	}
}

// D2 regression: the reset email is sent after the handler returns, on a
// context that is not the (now-canceled) request context.
func TestRequestPasswordResetSendsAfterResponse(t *testing.T) {
	e := newEnv(t)
	e.users.byEmail["ada@example.com"] = map[string]any{"_id": "u1", "FullName": "Ada", "Email": "ada@example.com"}
	rec := e.do(http.MethodPost, "/api/users/forgot-password", `{"Email":"ada@example.com"}`)
	if rec.Code != 200 {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
	waitFor(t, 2*time.Second, func() bool { return e.mailer.count() >= 1 })
}

// D2 regression: verification mail also survives the request context.
func TestJoinSendsVerificationAfterResponse(t *testing.T) {
	e := newEnv(t)
	rec := e.do(http.MethodPost, "/api/users/join",
		`{"FullName":"Ada","Username":"ada","Password":"password1","Email":"ada@example.com"}`)
	if rec.Code != 200 {
		t.Fatalf("status = %d", rec.Code)
	}
	waitFor(t, 2*time.Second, func() bool { return e.mailer.count() >= 1 })
}

func TestAllUserRoutesRegistered(t *testing.T) {
	e := newEnv(t)
	want := map[string]string{
		"users.joinUser":             "POST /api/users/join",
		"users.loginUser":            "POST /api/users/login",
		"users.requestPasswordReset": "POST /api/users/forgot-password",
		"users.resetPassword":        "POST /api/users/reset-password",
		"users.verifyEmail":          "POST /api/users/verify-email",
		"users.resendVerification":   "POST /api/users/resend-verification",
		"users.setEmail":             "POST /api/users/email",
		"users.changePassword":       "POST /api/users/change-password",
		"users.getUser":              "GET /api/users/{id}",
		"users.logoutUser":           "DELETE /api/users/{id}/logout",
		"users.updateUser":           "POST /api/users/{id}/update",
		"users.addClubsToUser":       "POST /api/users/{id}/add-clubs",
		"users.addClubToUser":        "POST /api/users/{id}/add-club",
		"users.removeClubFromUser":   "DELETE /api/users/{id}/clubs/{club_id}",
		"users.enterSession":         "POST /api/users/enter",
	}
	got := map[string]string{}
	for _, r := range e.srv.Routes() {
		if strings.HasPrefix(r.ID, "users.") {
			got[r.ID] = r.Method + " " + r.Path
		}
	}
	if len(got) != len(want) {
		t.Fatalf("registered %d user routes, want %d: %v", len(got), len(want), got)
	}
	for id, sig := range want {
		if got[id] != sig {
			t.Fatalf("%s = %q, want %q", id, got[id], sig)
		}
	}
}

func TestJoinDuplicateUsername(t *testing.T) {
	e := newEnv(t)
	e.users.createErr = &auth.ConflictError{}
	rec := e.do(http.MethodPost, "/api/users/join",
		`{"FullName":"Ada","Username":"ada","Password":"password1","Email":"ada@example.com"}`)
	if rec.Code != 400 || !strings.Contains(rec.Body.String(), "Username already exists!") {
		t.Fatalf("duplicate = %d %s", rec.Code, rec.Body.String())
	}
}

func TestLoginReturnsClubIDs(t *testing.T) {
	e := newEnv(t)
	hash, _ := auth.HashPassword("password1")
	e.users.byUsername["bob"] = map[string]any{"_id": "u1", "Username": "bob", "Password": hash, "EmailVerifiedAt": nil}
	e.clubs.byID["c1"] = map[string]any{"_id": "c1", "Name": "Rovers", "UserId": "u1"}
	rec := e.do(http.MethodPost, "/api/users/login", `{"Username":"bob","Password":"password1"}`)
	if rec.Code != 200 {
		t.Fatalf("login = %d %s", rec.Code, rec.Body.String())
	}
	p := payload(t, rec)
	clubs, ok := p["Clubs"].([]any)
	if !ok || len(clubs) != 1 || clubs[0] != "c1" {
		t.Fatalf("Clubs = %v, want [c1]", p["Clubs"])
	}
}

func TestLoginBadPassword(t *testing.T) {
	e := newEnv(t)
	hash, _ := auth.HashPassword("password1")
	e.users.byUsername["bob"] = map[string]any{"_id": "u1", "Username": "bob", "Password": hash}
	rec := e.do(http.MethodPost, "/api/users/login", `{"Username":"bob","Password":"wrong"}`)
	if rec.Code != 400 {
		t.Fatalf("status = %d", rec.Code)
	}
	p := payload(t, rec)
	if p["errorCode"] != float64(1) {
		t.Fatalf("errorCode = %v", p["errorCode"])
	}
}

func TestGetUserPopulateReturnsFullClubs(t *testing.T) {
	e := newEnv(t)
	e.users.byID["u1"] = map[string]any{"_id": "u1", "FullName": "Ada", "EmailVerifiedAt": nil}
	e.clubs.byID["c1"] = map[string]any{"_id": "c1", "Name": "Rovers", "UserId": "u1",
		"AddressCountryId": "p1", "AddressCountry": map[string]any{"_id": "p1", "Name": "Bellea"}}
	rec := e.do(http.MethodGet, "/api/users/u1?populate=true", "")
	if rec.Code != 200 {
		t.Fatalf("status = %d", rec.Code)
	}
	p := payload(t, rec)
	clubs, ok := p["Clubs"].([]any)
	if !ok || len(clubs) != 1 {
		t.Fatalf("Clubs = %v", p["Clubs"])
	}
	first, ok := clubs[0].(map[string]any)
	if !ok || first["Name"] != "Rovers" {
		t.Fatalf("club should be a full object, got %v", clubs[0])
	}
	if _, ok := first["AddressCountry"]; !ok {
		t.Fatalf("AddressCountry must be present on a populated club: %v", first)
	}
}

func TestGetUserNotFound(t *testing.T) {
	e := newEnv(t)
	rec := e.do(http.MethodGet, "/api/users/missing", "")
	if rec.Code != 404 {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestUpdateUserStripsNonAllowlistedFields(t *testing.T) {
	e := newEnv(t)
	e.store.data["sid1"] = map[string]any{"userID": "u1"}
	e.users.byID["u1"] = map[string]any{"_id": "u1", "FullName": "Old"}
	rec := e.do(http.MethodPost, "/api/users/u1/update",
		`{"FullName":"New","Password":"secret","isAdmin":true,"Hacked":"x","Age":30}`,
		cookieFor("sid1"))
	if rec.Code != 200 {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if e.users.updated["FullName"] != "New" {
		t.Fatalf("FullName should pass through, got %v", e.users.updated)
	}
	for _, forbidden := range []string{"Password", "isAdmin", "Hacked"} {
		if _, ok := e.users.updated[forbidden]; ok {
			t.Fatalf("%s must be stripped for a non-admin: %v", forbidden, e.users.updated)
		}
	}
	if _, ok := e.users.updated["Age"]; !ok {
		t.Fatal("Age is allowlisted and must pass through")
	}
}

func TestUpdateUserRequiresOwnAccount(t *testing.T) {
	e := newEnv(t)
	e.store.data["sid1"] = map[string]any{"userID": "u1"}
	rec := e.do(http.MethodPost, "/api/users/u2/update", `{"FullName":"Nope"}`, cookieFor("sid1"))
	if rec.Code != 403 {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "payload") {
		t.Fatalf("deny must not carry payload: %s", rec.Body.String())
	}
}

func TestChangePassword(t *testing.T) {
	e := newEnv(t)
	hash, _ := auth.HashPassword("oldpass1")
	e.users.byUsername["bob"] = map[string]any{"_id": "u1", "Username": "bob", "Password": hash, "EmailVerifiedAt": nil}
	e.store.data["sid1"] = map[string]any{"userID": "u1"}
	rec := e.do(http.MethodPost, "/api/users/change-password",
		`{"Username":"bob","CurrentPassword":"oldpass1","NewPassword":"newpass1"}`,
		cookieFor("sid1"))
	if rec.Code != 200 {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if e.users.updated["Password"] != "newpass1" {
		t.Fatalf("new password should be written (store hashes it), got %v", e.users.updated)
	}
}

func TestChangePasswordWrongCurrent(t *testing.T) {
	e := newEnv(t)
	hash, _ := auth.HashPassword("oldpass1")
	e.users.byUsername["bob"] = map[string]any{"_id": "u1", "Username": "bob", "Password": hash}
	e.store.data["sid1"] = map[string]any{"userID": "u1"}
	rec := e.do(http.MethodPost, "/api/users/change-password",
		`{"Username":"bob","CurrentPassword":"nope","NewPassword":"newpass1"}`, cookieFor("sid1"))
	if rec.Code != 400 || !strings.Contains(rec.Body.String(), "Current password is incorrect") {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
}

func TestResetPasswordMarksVerifiedAndRevokes(t *testing.T) {
	e := newEnv(t)
	e.tokens.consumeUser = "u1"
	e.tokens.consumeOK = true
	e.store.data["sid1"] = map[string]any{"userID": "u1"}
	rec := e.do(http.MethodPost, "/api/users/reset-password", `{"Token":"tok","NewPassword":"newpass1"}`)
	if rec.Code != 200 {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if _, ok := e.users.updated["EmailVerifiedAt"]; !ok {
		t.Fatalf("reset must set EmailVerifiedAt: %v", e.users.updated)
	}
	if _, ok := e.store.data["sid1"]; ok {
		t.Fatal("reset must revoke the user's sessions")
	}
}

func TestResetPasswordExpiredToken(t *testing.T) {
	e := newEnv(t)
	e.tokens.consumeOK = false
	rec := e.do(http.MethodPost, "/api/users/reset-password", `{"Token":"tok","NewPassword":"newpass1"}`)
	if rec.Code != 400 || !strings.Contains(rec.Body.String(), "expired") {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
}

func TestSetEmailConflict(t *testing.T) {
	e := newEnv(t)
	hash, _ := auth.HashPassword("password1")
	e.users.byID["u1"] = map[string]any{"_id": "u1", "Email": "old@example.com", "Password": hash, "EmailVerifiedAt": nil}
	e.users.byEmail["taken@example.com"] = map[string]any{"_id": "u2"}
	e.store.data["sid1"] = map[string]any{"userID": "u1"}
	rec := e.do(http.MethodPost, "/api/users/email", `{"Email":"taken@example.com","Password":"password1"}`, cookieFor("sid1"))
	if rec.Code != 409 {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestLogoutUser(t *testing.T) {
	e := newEnv(t)
	e.users.byID["u1"] = map[string]any{"_id": "u1", "Session": "exists"}
	e.store.data["exists"] = map[string]any{"userID": "u1"}
	e.store.data["sid1"] = map[string]any{"userID": "u1"}
	rec := e.do(http.MethodDelete, "/api/users/u1/logout", "", cookieFor("sid1"))
	if rec.Code != 200 {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if _, ok := e.store.data["exists"]; ok {
		t.Fatal("the user's session must be destroyed")
	}
}

func TestResendVerificationRequiresSession(t *testing.T) {
	e := newEnv(t)
	// The route-policy guard for users.resendVerification is signedIn, so an
	// anonymous request is denied before the handler runs.
	rec := e.do(http.MethodPost, "/api/users/resend-verification", "")
	if rec.Code != 401 || !strings.Contains(rec.Body.String(), "Not logged in") {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
}

func TestEnterSessionNotFound(t *testing.T) {
	e := newEnv(t)
	rec := e.do(http.MethodPost, "/api/users/enter", `{"userID":"nope","sessionID":"sid"}`)
	if rec.Code != 404 {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestAddClubToUser(t *testing.T) {
	e := newEnv(t)
	e.clubs.byID["c1"] = map[string]any{"_id": "c1", "Name": "Rovers"}
	e.store.data["sid1"] = map[string]any{"userID": "admin"}
	rec := e.do(http.MethodPost, "/api/users/u1/add-club", `{"clubId":"c1"}`, cookieFor("sid1"))
	if rec.Code != 200 {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
	if e.clubs.byID["c1"]["UserId"] != "u1" {
		t.Fatalf("club owner not set: %v", e.clubs.byID["c1"])
	}
}

func TestRemoveClubFromUser(t *testing.T) {
	e := newEnv(t)
	e.clubs.byID["c1"] = map[string]any{"_id": "c1", "Name": "Rovers", "UserId": "u1"}
	e.store.data["sid1"] = map[string]any{"userID": "u1"}
	rec := e.do(http.MethodDelete, "/api/users/u1/clubs/c1", "", cookieFor("sid1"))
	if rec.Code != 200 {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
	if e.clubs.byID["c1"]["UserId"] != nil {
		t.Fatalf("club owner should be cleared: %v", e.clubs.byID["c1"])
	}
}
