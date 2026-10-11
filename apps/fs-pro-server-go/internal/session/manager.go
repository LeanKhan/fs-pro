package session

import (
	"context"
	"net/http"
	"time"

	"fs-pro-server/internal/db"
)

// State is one request's session. ID is the session id bound to the request
// (from a valid cookie or freshly generated); Data is the JSON object stored in
// "Sessions.session"; Dirty is set once Save persists it, which tells the
// session middleware to emit Set-Cookie.
type State struct {
	ID     string
	Data   map[string]any
	Loaded bool
	Dirty  bool
	IsNew  bool
}

// UserID returns the signed-in user id ("" when anonymous).
func (s *State) UserID() string {
	if s == nil || s.Data == nil {
		return ""
	}
	v, _ := s.Data["userID"].(string)
	return v
}

// Set writes a top-level session field.
func (s *State) Set(key string, value any) {
	if s.Data == nil {
		s.Data = map[string]any{}
	}
	s.Data[key] = value
}

// Manager loads, saves and destroys sessions. Store may be nil (no
// DATABASE_URL): loads then behave as anonymous and saves return an error.
type Manager struct {
	Store        Store
	Secret       string
	CookieSecure bool
	MaxAge       time.Duration
}

// NewManager builds a Manager for the given store and cookie parameters.
func NewManager(store Store, secret string, secure bool, maxAge time.Duration) *Manager {
	if maxAge <= 0 {
		maxAge = 30 * 24 * time.Hour
	}
	return &Manager{Store: store, Secret: secret, CookieSecure: secure, MaxAge: maxAge}
}

// Load resolves the request's session. A missing/invalid cookie, an unknown
// session id, or a store error all yield a fresh, unsaved session, matching
// express-session's saveUninitialized:false behaviour.
func (m *Manager) Load(ctx context.Context, r *http.Request) *State {
	if sid, ok := ParseCookie(r, m.Secret); ok && m.Store != nil {
		if data, err := m.Store.Get(ctx, sid); err == nil && data != nil {
			return &State{ID: sid, Data: data, Loaded: true}
		}
	}
	id, err := newID()
	if err != nil {
		id = ""
	}
	return &State{ID: id, Data: m.defaultData(), IsNew: true}
}

// Get reads a stored session by id (used by the logout/enter handlers).
func (m *Manager) Get(ctx context.Context, sid string) (map[string]any, error) {
	if m.Store == nil || sid == "" {
		return nil, nil
	}
	return m.Store.Get(ctx, sid)
}

// Set stores an explicit session object under sid (enterSession's re-issue).
func (m *Manager) Set(ctx context.Context, sid string, data map[string]any) error {
	if m.Store == nil {
		return nil
	}
	return m.Store.Set(ctx, sid, data)
}

// Destroy deletes a session row.
func (m *Manager) Destroy(ctx context.Context, sid string) error {
	if m.Store == nil || sid == "" {
		return nil
	}
	return m.Store.Destroy(ctx, sid)
}

// Revoke deletes every session belonging to userID (after a password reset).
// Stores that cannot do it (test fakes) are a no-op.
func (m *Manager) Revoke(ctx context.Context, userID string) error {
	if m.Store == nil || userID == "" {
		return nil
	}
	if revoker, ok := m.Store.(interface {
		DeleteByUserID(ctx context.Context, userID string) error
	}); ok {
		return revoker.DeleteByUserID(ctx, userID)
	}
	return nil
}

// Save persists the request's session and marks it dirty so the middleware
// sends the cookie.
func (m *Manager) Save(ctx context.Context, st *State) error {
	if st == nil {
		return nil
	}
	m.ensureCookie(st)
	if m.Store == nil {
		return nil
	}
	if err := m.Store.Set(ctx, st.ID, st.Data); err != nil {
		return err
	}
	st.Dirty = true
	return nil
}

// Cookie builds the Set-Cookie for a saved session.
func (m *Manager) Cookie(st *State) *http.Cookie {
	return &http.Cookie{
		Name:     CookieName,
		Value:    Sign(st.ID, m.Secret),
		Path:     "/",
		MaxAge:   int(m.MaxAge.Seconds()),
		HttpOnly: true,
		Secure:   m.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	}
}

func (m *Manager) defaultData() map[string]any {
	return map[string]any{"cookie": m.cookieObject(time.Now().Add(m.MaxAge))}
}

func (m *Manager) cookieObject(expires time.Time) map[string]any {
	ms := m.MaxAge.Milliseconds()
	return map[string]any{
		"originalMaxAge": ms,
		"expires":        db.ISO8601msUTC(expires),
		"secure":         m.CookieSecure,
		"httpOnly":       true,
		"path":           "/",
		"sameSite":       "lax",
		"maxAge":         ms,
	}
}

func (m *Manager) ensureCookie(st *State) {
	if st.Data == nil {
		st.Data = map[string]any{}
	}
	expires := time.Now().Add(m.MaxAge)
	if cookie, ok := st.Data["cookie"].(map[string]any); ok {
		cookie["maxAge"] = m.MaxAge.Milliseconds()
		cookie["originalMaxAge"] = m.MaxAge.Milliseconds()
		cookie["expires"] = db.ISO8601msUTC(expires)
		return
	}
	st.Data["cookie"] = m.cookieObject(expires)
}
