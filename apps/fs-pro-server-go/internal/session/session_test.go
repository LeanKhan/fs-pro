package session

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

// Fixture captured from the installed cookie-signature@1.0.6 (see NOTES.md):
//
//	node -e "require('cookie-signature').sign('S1a2b3c4d5e6f7g8h9i0','test-secret')"
const (
	fixtureSecret = "test-secret"
	fixtureSID    = "S1a2b3c4d5e6f7g8h9i0"
	fixtureCookie = "s:S1a2b3c4d5e6f7g8h9i0.1sRA2npOqWLh1dSa2BcuXX6Iq+xVvGnr9HzNvaByNqA"
)

func TestSignMatchesCookieSignatureFixture(t *testing.T) {
	if got := Sign(fixtureSID, fixtureSecret); got != fixtureCookie {
		t.Fatalf("Sign = %q, want %q", got, fixtureCookie)
	}
}

func TestUnsignAcceptsFixture(t *testing.T) {
	sid, ok := Unsign(fixtureCookie, fixtureSecret)
	if !ok || sid != fixtureSID {
		t.Fatalf("Unsign = (%q,%v), want (%q,true)", sid, ok, fixtureSID)
	}
}

func TestUnsignRejectsTamperedSignature(t *testing.T) {
	tampered := fixtureCookie[:len(fixtureCookie)-1] + "X"
	if _, ok := Unsign(tampered, fixtureSecret); ok {
		t.Fatal("tampered cookie must not validate")
	}
}

func TestUnsignRejectsWrongSecret(t *testing.T) {
	if _, ok := Unsign(fixtureCookie, "other-secret"); ok {
		t.Fatal("wrong secret must not validate")
	}
}

func TestUnsignRejectsUnsignedValue(t *testing.T) {
	for _, v := range []string{fixtureSID, "foo.bar", "s:", "s:" + fixtureSID} {
		if _, ok := Unsign(v, fixtureSecret); ok {
			t.Fatalf("%q must not validate", v)
		}
	}
}

func TestParseCookiePercentDecoded(t *testing.T) {
	encoded := url.QueryEscape(fixtureCookie) // s%3A...%2B...
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Cookie", CookieName+"="+encoded)
	sid, ok := ParseCookie(req, fixtureSecret)
	if !ok || sid != fixtureSID {
		t.Fatalf("ParseCookie = (%q,%v), want (%q,true)", sid, ok, fixtureSID)
	}
}

func TestParseCookieRawValue(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: CookieName, Value: fixtureCookie})
	if sid, ok := ParseCookie(req, fixtureSecret); !ok || sid != fixtureSID {
		t.Fatalf("raw cookie should parse, got (%q,%v)", sid, ok)
	}
}

func TestManagerLoadFreshWithoutCookie(t *testing.T) {
	m := NewManager(nil, fixtureSecret, false, 0)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	st := m.Load(req.Context(), req)
	if st.Loaded || st.ID == "" {
		t.Fatalf("expected a fresh session with a generated id, got %+v", st)
	}
	if _, ok := st.Data["cookie"]; !ok {
		t.Fatal("fresh session should carry cookie defaults")
	}
}
