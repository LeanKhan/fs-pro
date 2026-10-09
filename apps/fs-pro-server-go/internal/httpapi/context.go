package httpapi

import (
	"context"
	"log/slog"
	"net/http"

	"fs-pro-server/internal/session"
)

type ctxKey struct{}

// Context is the per-request state shared across middleware and handlers: the
// request logger, the resolved route id, the buffered body and the session.
type Context struct {
	Logger     *slog.Logger
	RouteID    string
	Body       []byte
	bodyMap    map[string]any
	hasBodyMap bool
	Session    *session.State
}

// NewContext builds a request Context.
func NewContext(logger *slog.Logger) *Context { return &Context{Logger: logger} }

// WithContext stores c on the request context.
func WithContext(parent context.Context, c *Context) context.Context {
	return context.WithValue(parent, ctxKey{}, c)
}

// Get returns the request Context, or nil if the middleware chain was bypassed.
func Get(r *http.Request) *Context {
	c, _ := r.Context().Value(ctxKey{}).(*Context)
	return c
}

// SessionUserID is a convenience for middleware that only needs the user id.
func SessionUserID(r *http.Request) string {
	if c := Get(r); c != nil && c.Session != nil {
		return c.Session.UserID()
	}
	return ""
}

// BodyBytes returns the buffered request body.
func (c *Context) BodyBytes() []byte {
	if c == nil {
		return nil
	}
	return c.Body
}

// BodyMap returns the top-level JSON object body (after any KeepFields
// filtering), and whether the body was an object at all.
func (c *Context) BodyMap() (map[string]any, bool) {
	if c == nil {
		return nil, false
	}
	return c.bodyMap, c.hasBodyMap
}

// SetBodyMap replaces the parsed object body (used by the policy guard's
// KeepFields pass).
func (c *Context) SetBodyMap(m map[string]any) {
	if c == nil {
		return
	}
	c.bodyMap = m
	c.hasBodyMap = m != nil
}
