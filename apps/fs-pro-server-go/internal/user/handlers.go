// Package user implements the 15 users.* routes: registration, login, email
// verification, password reset/change, account updates and the club-ownership
// helpers. Behaviour mirrors apps/fs-pro-server/src/controllers/user/
// user.router.ts exactly, including its messages and status codes.
package user

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"fs-pro-server/internal/auth"
	"fs-pro-server/internal/httpapi"
	"fs-pro-server/internal/mail"
	"fs-pro-server/internal/session"
)

// SessionManager is the subset of *session.Manager the handlers use.
type SessionManager interface {
	Save(ctx context.Context, st *session.State) error
	Get(ctx context.Context, sid string) (map[string]any, error)
	Set(ctx context.Context, sid string, data map[string]any) error
	Destroy(ctx context.Context, sid string) error
	Revoke(ctx context.Context, userID string) error
}

// Deps are the handler collaborators. Every one is an interface so handlers are
// unit-testable without Postgres.
type Deps struct {
	Users    auth.UserStore
	Clubs    auth.ClubStore
	Tokens   auth.TokenStore
	Sessions SessionManager
	Mail     mail.Sender
	Logger   *slog.Logger
}

// Handlers holds the route dependencies.
type Handlers struct {
	deps Deps
}

// New builds the handler set.
func New(deps Deps) *Handlers {
	if deps.Logger == nil {
		deps.Logger = slog.Default()
	}
	return &Handlers{deps: deps}
}

var usernamePattern = regexp.MustCompile(`^[A-Za-z0-9_.-]{3,24}$`)
var emailPattern = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

const legacyLoginOffMessage = "Password login is disabled - sign in through imagination."

func legacyLoginDisabled() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("LEGACY_LOGIN_ENABLED")), "false")
}

func normalizeEmail(email string) string { return strings.ToLower(strings.TrimSpace(email)) }

func looksLikeEmail(email string) bool { return len(email) <= 254 && emailPattern.MatchString(email) }

func fail(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func str(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	s, _ := m[key].(string)
	return s
}

func (h *Handlers) body(cx *httpapi.Context) map[string]any {
	m, _ := cx.BodyMap()
	return m
}

func (h *Handlers) sessionState(cx *httpapi.Context) *session.State {
	return cx.Session
}

// backgroundMailTimeout bounds fire-and-forget mail work. It must not use the
// request context: net/http cancels that as soon as the handler returns.
const backgroundMailTimeout = 30 * time.Second

// sendVerificationAsync issues a verify token and emails it in the background,
// ignoring failures so a mail outage never fails the request and never blocks
// the response (mirrors Node's `.catch(...)` without await).
func (h *Handlers) sendVerificationAsync(user map[string]any) {
	if user == nil {
		return
	}
	id := str(user, "_id")
	email := str(user, "Email")
	if id == "" || email == "" {
		return
	}
	name := str(user, "FullName")
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), backgroundMailTimeout)
		defer cancel()
		token, err := h.deps.Tokens.Issue(ctx, id, auth.TokenVerify)
		if err != nil {
			h.deps.Logger.Error("verification token issue failed", "err", err)
			return
		}
		_ = h.deps.Mail.Send(ctx, mail.VerificationMail(email, name, token))
	}()
}

// joinUser is POST /api/users/join.
func (h *Handlers) joinUser(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if legacyLoginDisabled() {
		return httpapi.Fail(403, legacyLoginOffMessage, nil)
	}
	body := h.body(cx)
	username := str(body, "Username")
	fullName := str(body, "FullName")
	password := str(body, "Password")
	email := normalizeEmail(str(body, "Email"))

	problem := ""
	switch {
	case !usernamePattern.MatchString(username):
		problem = "Usernames are 3-24 letters, numbers, dots, dashes or underscores"
	case len(password) < 8:
		problem = "Use a password of at least 8 characters"
	case strings.TrimSpace(fullName) == "":
		problem = "Tell us your name"
	case !looksLikeEmail(email):
		problem = "Enter a valid email address"
	}
	if problem != "" {
		return httpapi.Fail(400, problem, nil)
	}

	ctx := r.Context()
	created, err := h.deps.Users.Create(ctx, map[string]any{
		"FullName": fullName,
		"Username": username,
		"Password": password,
		"Email":    email,
	})
	if err != nil {
		return createUserError(err)
	}
	h.sendVerificationAsync(created)

	st := h.sessionState(cx)
	st.Set("userID", str(created, "_id"))
	if err := h.deps.Sessions.Save(ctx, st); err != nil {
		return httpapi.Fail(400, "Error creating user", fail(err))
	}

	authenticated, err := h.deps.Users.Update(ctx, str(created, "_id"), map[string]any{"Session": st.ID})
	if err != nil {
		return httpapi.Fail(400, "Error creating user", fail(err))
	}
	return httpapi.OK("User authenticated successfully", auth.SanitizeUser(authenticated))
}

func createUserError(err error) httpapi.Response {
	var conflict *auth.ConflictError
	if errors.As(err, &conflict) {
		if conflict.Email {
			return httpapi.Fail(400, "That email is already used by another account", fail(err))
		}
		return httpapi.Fail(400, "Username already exists!", fail(err))
	}
	return httpapi.Fail(400, "Error creating user", fail(err))
}

// loginUser is POST /api/users/login.
func (h *Handlers) loginUser(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if legacyLoginDisabled() {
		return httpapi.Fail(403, legacyLoginOffMessage, nil)
	}
	ctx := r.Context()
	body := h.body(cx)
	username := str(body, "Username")
	password := str(body, "Password")

	found, err := h.deps.Users.FindByUsername(ctx, username)
	if err != nil {
		return httpapi.Fail(400, "Error logging in", fail(err))
	}
	if found == nil {
		// Same work as a real check, so the response time doesn't give it away.
		auth.ComparePassword(password, auth.DummyHash())
		return badLogin()
	}
	if !auth.ComparePassword(password, str(found, "Password")) {
		return badLogin()
	}

	st := h.sessionState(cx)
	st.Set("userID", str(found, "_id"))
	if err := h.deps.Sessions.Save(ctx, st); err != nil {
		return httpapi.Fail(400, "Error logging in", fail(err))
	}

	updated, err := h.deps.Users.Update(ctx, str(found, "_id"), map[string]any{"Session": st.ID})
	if err != nil {
		return httpapi.Fail(400, "Error logging in", fail(err))
	}
	clubs, err := h.deps.Clubs.FindByUserID(ctx, str(found, "_id"))
	if err != nil {
		return httpapi.Fail(400, "Error logging in", fail(err))
	}
	ids := make([]any, 0, len(clubs))
	for _, club := range clubs {
		ids = append(ids, club["_id"])
	}
	payload := auth.SanitizeUser(updated)
	payload["Clubs"] = ids
	return httpapi.OK("User authenticated successfully", payload)
}

func badLogin() httpapi.Response {
	return httpapi.Fail(400, "Username or password is incorrect", map[string]any{"errorCode": 1})
}

// changePassword is POST /api/users/change-password.
func (h *Handlers) changePassword(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if legacyLoginDisabled() {
		return httpapi.Fail(403, legacyLoginOffMessage, nil)
	}
	ctx := r.Context()
	sessionUserID := h.sessionState(cx).UserID()
	if sessionUserID == "" {
		return httpapi.Fail(401, "Sign in to change your password", nil)
	}
	body := h.body(cx)
	result, err := h.deps.Users.FindByUsername(ctx, str(body, "Username"))
	if err != nil {
		return httpapi.Fail(400, "Error changing password", fail(err))
	}
	if result == nil {
		return httpapi.Fail(404, "Username does not exist", nil)
	}
	if str(result, "_id") != sessionUserID {
		return httpapi.Fail(403, "You can only change your own password", nil)
	}
	if !auth.ComparePassword(str(body, "CurrentPassword"), str(result, "Password")) {
		return httpapi.Fail(400, "Current password is incorrect", nil)
	}
	updated, err := h.deps.Users.Update(ctx, str(result, "_id"), map[string]any{"Password": str(body, "NewPassword")})
	if err != nil {
		return httpapi.Fail(400, "Error changing password", fail(err))
	}
	return httpapi.OK("Password changed successfully", auth.SanitizeUser(updated))
}

// requestPasswordReset is POST /api/users/forgot-password.
func (h *Handlers) requestPasswordReset(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	body := map[string]any{}
	if cx := httpapi.Get(r); cx != nil {
		body, _ = cx.BodyMap()
	}
	email := normalizeEmail(str(body, "Email"))
	if looksLikeEmail(email) {
		// Not awaited, and on a background context so it survives this
		// handler returning: neither the response nor its timing reveals
		// whether the address has an account.
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), backgroundMailTimeout)
			defer cancel()
			found, err := h.deps.Users.FindByEmail(ctx, email)
			if err != nil || found == nil {
				return
			}
			token, terr := h.deps.Tokens.Issue(ctx, str(found, "_id"), auth.TokenReset)
			if terr != nil {
				return
			}
			_ = h.deps.Mail.Send(ctx, mail.ResetMail(email, str(found, "FullName"), token))
		}()
	}
	return httpapi.OKNoPayload(200, "If that email belongs to an account, we have sent a link to reset the password.")
}

// resetPassword is POST /api/users/reset-password.
func (h *Handlers) resetPassword(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	body := map[string]any{}
	if cx := httpapi.Get(r); cx != nil {
		body, _ = cx.BodyMap()
	}
	userID, ok, err := h.deps.Tokens.Consume(ctx, str(body, "Token"), auth.TokenReset)
	if err != nil {
		return httpapi.Fail(400, "Could not reset the password", fail(err))
	}
	if !ok {
		return httpapi.Fail(400, "This link has expired or was already used. Ask for a new one.", nil)
	}
	if _, err := h.deps.Users.Update(ctx, userID, map[string]any{
		"Password":        str(body, "NewPassword"),
		"EmailVerifiedAt": time.Now(),
	}); err != nil {
		return httpapi.Fail(400, "Could not reset the password", fail(err))
	}
	_ = h.deps.Sessions.Revoke(ctx, userID)
	return httpapi.OKNoPayload(200, "Password changed. Sign in with the new one.")
}

// verifyEmail is POST /api/users/verify-email.
func (h *Handlers) verifyEmail(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	body := map[string]any{}
	if cx := httpapi.Get(r); cx != nil {
		body, _ = cx.BodyMap()
	}
	userID, ok, err := h.deps.Tokens.Consume(ctx, str(body, "Token"), auth.TokenVerify)
	if err != nil {
		return httpapi.Fail(400, "Could not confirm the email", fail(err))
	}
	if !ok {
		return httpapi.Fail(400, "This link has expired or was already used. Sign in and ask for a new one.", nil)
	}
	if _, err := h.deps.Users.Update(ctx, userID, map[string]any{"EmailVerifiedAt": time.Now()}); err != nil {
		return httpapi.Fail(400, "Could not confirm the email", fail(err))
	}
	return httpapi.OKNoPayload(200, "Email confirmed. Thank you!")
}

// resendVerification is POST /api/users/resend-verification.
func (h *Handlers) resendVerification(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	userID := h.sessionState(cx).UserID()
	if userID == "" {
		return httpapi.Fail(401, "Sign in first", nil)
	}
	found, err := h.deps.Users.FindByID(ctx, userID)
	if err != nil {
		return httpapi.Fail(400, "Error sending verification", fail(err))
	}
	if str(found, "Email") == "" {
		return httpapi.Fail(400, "Add an email address first", nil)
	}
	if found["EmailVerifiedAt"] != nil {
		return httpapi.Fail(400, "Your email is already confirmed", nil)
	}
	h.sendVerificationAsync(found)
	return httpapi.OKNoPayload(200, "We sent a new link to "+str(found, "Email")+".")
}

// setEmail is POST /api/users/email.
func (h *Handlers) setEmail(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	userID := h.sessionState(cx).UserID()
	if userID == "" {
		return httpapi.Fail(401, "Sign in first", nil)
	}
	body := h.body(cx)
	email := normalizeEmail(str(body, "Email"))
	if !looksLikeEmail(email) {
		return httpapi.Fail(400, "Enter a valid email address", nil)
	}
	found, err := h.deps.Users.FindByID(ctx, userID)
	if err != nil {
		return httpapi.Fail(400, "Could not save the email", fail(err))
	}
	if found == nil {
		return httpapi.Fail(401, "Sign in first", nil)
	}
	if !auth.ComparePassword(str(body, "Password"), str(found, "Password")) {
		return httpapi.Fail(400, "Password is incorrect", nil)
	}
	taken, err := h.deps.Users.FindByEmail(ctx, email)
	if err != nil {
		return httpapi.Fail(400, "Could not save the email", fail(err))
	}
	if taken != nil && str(taken, "_id") != userID {
		return httpapi.Fail(409, "That email is already used by another account", nil)
	}
	if strings.EqualFold(str(found, "Email"), email) && found["EmailVerifiedAt"] != nil {
		return httpapi.OK("Email already confirmed", auth.SanitizeUser(found))
	}
	updated, err := h.deps.Users.Update(ctx, userID, map[string]any{"Email": email, "EmailVerifiedAt": nil})
	if err != nil {
		var conflict *auth.ConflictError
		if errors.As(err, &conflict) {
			return httpapi.Fail(409, "That email is already used by another account", nil)
		}
		return httpapi.Fail(400, "Could not save the email", fail(err))
	}
	h.sendVerificationAsync(updated)
	return httpapi.OK("We sent a link to "+email+".", auth.SanitizeUser(updated))
}

// getUser is GET /api/users/{id}.
func (h *Handlers) getUser(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	id := r.PathValue("id")
	populate := r.URL.Query().Get("populate") == "true"

	found, err := h.deps.Users.FindByID(ctx, id)
	if err != nil {
		return httpapi.Fail(400, "Error fetching User", fail(err))
	}
	if found == nil {
		return httpapi.Fail(404, "User not found", nil)
	}
	if populate {
		clubs, cerr := h.deps.Clubs.FindByUserID(ctx, id)
		if cerr != nil {
			return httpapi.Fail(400, "Error fetching User", fail(cerr))
		}
		payload := make([]any, 0, len(clubs))
		for _, club := range clubs {
			payload = append(payload, club)
		}
		found["Clubs"] = payload
	}
	return httpapi.OK("User fetched successfully", auth.SanitizeUser(found))
}

// logoutUser is DELETE /api/users/{id}/logout.
func (h *Handlers) logoutUser(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	id := r.PathValue("id")
	found, err := h.deps.Users.FindByID(ctx, id)
	if err != nil {
		return httpapi.Fail(400, "Error logging out", fail(err))
	}
	if found == nil {
		return httpapi.Fail(404, "Username does not exist", nil)
	}
	sid := str(found, "Session")
	stored, err := h.deps.Sessions.Get(ctx, sid)
	if err != nil {
		return httpapi.Fail(400, "Error logging out", fail(err))
	}
	if stored == nil {
		return httpapi.Fail(400, "Error logging out", "Session not found! Try reloading")
	}
	if err := h.deps.Sessions.Destroy(ctx, sid); err != nil {
		return httpapi.Fail(400, "Error logging out", "Error in destroying Session")
	}
	return httpapi.OK("Client logged out successfully", map[string]any{})
}

// updateUser is POST /api/users/{id}/update.
func (h *Handlers) updateUser(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	id := r.PathValue("id")
	updated, err := h.deps.Users.Update(ctx, id, h.body(cx))
	if err != nil {
		return httpapi.Fail(400, "Error updating User", fail(err))
	}
	return httpapi.OK("User updated successfully", auth.SanitizeUser(updated))
}

// addClubsToUser is POST /api/users/{id}/add-clubs.
func (h *Handlers) addClubsToUser(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	id := r.PathValue("id")
	var clubIDs []string
	if err := json.Unmarshal(cx.BodyBytes(), &clubIDs); err != nil {
		return httpapi.Fail(400, "Error adding Clubs", fail(err))
	}
	for _, clubID := range clubIDs {
		if _, err := h.deps.Clubs.SetOwner(ctx, clubID, id); err != nil {
			return httpapi.Fail(400, "Error adding Clubs", fail(err))
		}
	}
	clubs, err := h.deps.Clubs.FindByUserID(ctx, id)
	if err != nil {
		return httpapi.Fail(400, "Error adding Clubs", fail(err))
	}
	payload := make([]any, 0, len(clubs))
	for _, club := range clubs {
		payload = append(payload, club)
	}
	return httpapi.OK("Clubs added successfully", payload)
}

// addClubToUser is POST /api/users/{id}/add-club.
func (h *Handlers) addClubToUser(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	id := r.PathValue("id")
	body := h.body(cx)
	club, err := h.deps.Clubs.SetOwner(ctx, str(body, "clubId"), id)
	if err != nil {
		return httpapi.Fail(400, "Error adding Club", fail(err))
	}
	return httpapi.OK("Club added successfully", club)
}

// removeClubFromUser is DELETE /api/users/{id}/clubs/{club_id}.
func (h *Handlers) removeClubFromUser(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	club, err := h.deps.Clubs.SetOwner(ctx, r.PathValue("club_id"), "")
	if err != nil {
		return httpapi.Fail(400, "Error removing Club", fail(err))
	}
	return httpapi.OK("User removed Club successfully", club)
}

// enterSession is POST /api/users/enter.
func (h *Handlers) enterSession(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	body := h.body(cx)
	userID := str(body, "userID")
	clientSessionID := str(body, "sessionID")

	found, err := h.deps.Users.FindByID(ctx, userID)
	if err != nil {
		return httpapi.Fail(400, "Error in authentication", fail(err))
	}
	if found == nil {
		return httpapi.Fail(404, "User not found", nil)
	}

	st := h.sessionState(cx)
	stored, err := h.deps.Sessions.Get(ctx, str(found, "Session"))
	if err != nil {
		return httpapi.Fail(400, "Error in authentication", fail(err))
	}
	if stored != nil {
		if err := h.deps.Sessions.Set(ctx, clientSessionID, stored); err != nil {
			return httpapi.Fail(400, "Error in authentication", fail(err))
		}
	} else {
		st.Set("userID", str(found, "_id"))
		if err := h.deps.Sessions.Save(ctx, st); err != nil {
			return httpapi.Fail(400, "Error in authentication", fail(err))
		}
	}
	if _, err := h.deps.Users.Update(ctx, userID, map[string]any{"Session": st.ID}); err != nil {
		return httpapi.Fail(400, "Error in authentication", fail(err))
	}
	return httpapi.OK("Client Authenticated successfully", map[string]any{
		"userID":    str(found, "_id"),
		"sessionID": st.ID,
	})
}
