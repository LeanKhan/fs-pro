// Package session implements express-session-compatible signed cookies and a
// Postgres-backed session store over the existing "Sessions" table. A cookie
// minted by the Node server validates here and vice versa.
package session

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/url"
	"strings"
)

// CookieName is the session cookie, matching server.ts.
const CookieName = "fspro.sid"

// Sign produces the express-session cookie value "s:<sid>.<sig>", where sig is
// the base64 (standard alphabet) HMAC-SHA256 of sid under secret with the
// trailing '=' padding removed - exactly cookie-signature's sign().
func Sign(sid, secret string) string {
	return "s:" + sid + "." + signature(sid, secret)
}

// Unsign validates value and returns the session id it carries. It accepts only
// values with the "s:" prefix; a bad prefix, missing separator or mismatched
// signature returns ok=false.
func Unsign(value, secret string) (sid string, ok bool) {
	if !strings.HasPrefix(value, "s:") {
		return "", false
	}
	body := value[len("s:"):]
	i := strings.LastIndex(body, ".")
	if i <= 0 {
		return "", false
	}
	sid = body[:i]
	sig := body[i+1:]
	expected := signature(sid, secret)
	if !hmac.Equal([]byte(sig), []byte(expected)) {
		return "", false
	}
	return sid, true
}

func signature(sid, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(sid))
	return strings.TrimRight(base64.StdEncoding.EncodeToString(mac.Sum(nil)), "=")
}

// ParseCookie reads fspro.sid, percent-decodes it (the Node `cookie` package
// URL-encodes the value when it sets Set-Cookie) and validates the signature.
func ParseCookie(r *http.Request, secret string) (sid string, ok bool) {
	c, err := r.Cookie(CookieName)
	if err != nil || c.Value == "" {
		return "", false
	}
	value := c.Value
	if strings.Contains(value, "%") {
		if decoded, derr := url.PathUnescape(value); derr == nil {
			value = decoded
		}
	}
	return Unsign(value, secret)
}

// newID returns a fresh session id shaped like express-session's uid-safe
// output (24 random bytes, base64url, no padding).
func newID() (string, error) {
	var b [24]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b[:]), nil
}
