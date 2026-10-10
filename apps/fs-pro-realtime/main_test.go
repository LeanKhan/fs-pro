package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

var testSecret = []byte("test-secret")

func TestTicketRoundTrip(t *testing.T) {
	now := time.Unix(1000, 0)
	tk, _ := IssueTicket(testSecret, Claims{UserID: "u1", Name: "Ada", Expires: 2000})
	c, err := VerifyTicket(testSecret, tk, now)
	if err != nil || c.UserID != "u1" || c.Name != "Ada" {
		t.Fatalf("got %+v, %v", c, err)
	}
	if _, err := VerifyTicket([]byte("other"), tk, now); err != errBadTicket {
		t.Fatalf("wrong secret accepted: %v", err)
	}
	if _, err := VerifyTicket(testSecret, tk, time.Unix(3000, 0)); err != errExpired {
		t.Fatalf("expired ticket accepted: %v", err)
	}
	tampered := strings.Replace(tk, tk[:4], "eyJ1", 1)
	if tampered != tk {
		if _, err := VerifyTicket(testSecret, tampered, now); err == nil {
			t.Fatal("tampered ticket accepted")
		}
	}
}

func TestCanJoin(t *testing.T) {
	c := Claims{UserID: "u", Clubs: []string{"c1"}}
	cases := map[string]bool{
		"world": true, "club:c1": true, "club:c2": false, "campus:c2": true,
		"edition:e": true, "fixture:f": true, "campus:": false, "nope": false, "secret:x": false,
	}
	for topic, want := range cases {
		if got := CanJoin(c, topic); got != want {
			t.Errorf("CanJoin(%q) = %v, want %v", topic, got, want)
		}
	}
	if !CanJoin(Claims{UserID: "a", Admin: true}, "club:any") {
		t.Error("admin should join any club topic")
	}
}

func TestBucket(t *testing.T) {
	b := newBucket(2, time.Second)
	now := time.Unix(0, 0)
	if !b.take(now) || !b.take(now) || b.take(now) {
		t.Fatal("burst of 2 expected")
	}
	if !b.take(now.Add(time.Second)) {
		t.Fatal("refill after 1s expected")
	}
}

func TestCleanChat(t *testing.T) {
	if got := cleanChat("  hi\n\tthere \x07 "); got != "hi there" {
		t.Fatalf("got %q", got)
	}
	if got := cleanChat(strings.Repeat("é", 400)); len([]rune(got)) != maxChatChars {
		t.Fatalf("not capped: %d", len([]rune(got)))
	}
}

// --- end to end -------------------------------------------------------------

type client struct {
	t  *testing.T
	ws *websocket.Conn
}

func dial(t *testing.T, srv *httptest.Server, c Claims) *client {
	t.Helper()
	c.Expires = time.Now().Add(time.Minute).Unix()
	tk, _ := IssueTicket(testSecret, c)
	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws?ticket=" + tk
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	ws, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	cl := &client{t: t, ws: ws}
	cl.expect("hello")
	return cl
}

func (c *client) send(v any) {
	b, _ := json.Marshal(v)
	if err := c.ws.Write(context.Background(), websocket.MessageText, b); err != nil {
		c.t.Fatalf("write: %v", err)
	}
}

// expect reads until a message of type typ arrives (skipping others).
func (c *client) expect(typ string) map[string]any {
	c.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	for {
		_, b, err := c.ws.Read(ctx)
		if err != nil {
			c.t.Fatalf("waiting for %q: %v", typ, err)
		}
		var m map[string]any
		_ = json.Unmarshal(b, &m)
		if m["type"] == typ {
			return m
		}
	}
}

func publish(t *testing.T, srv *httptest.Server, body string, secret []byte) int {
	req, _ := http.NewRequest("POST", srv.URL+"/publish", bytes.NewBufferString(body))
	req.Header.Set("X-Signature", hex.EncodeToString(sign(secret, []byte(body))))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	return res.StatusCode
}

func TestEndToEnd(t *testing.T) {
	hub := NewHub()
	srv := httptest.NewServer(newServer(config{secret: testSecret, origins: []string{"*"}}, hub))
	defer srv.Close()

	ada := dial(t, srv, Claims{UserID: "ada", Name: "Ada", Code: "ADA", Clubs: []string{"c-ada"}})
	bo := dial(t, srv, Claims{UserID: "bo", Name: "Bo", Clubs: []string{"c-bo"}})

	// Topic permissions.
	bo.send(map[string]string{"op": "sub", "topic": "club:c-ada"})
	if m := bo.expect("error"); m["message"] != "not allowed" {
		t.Fatalf("bo joined ada's club topic: %v", m)
	}

	// World events reach everyone on the world topic.
	ada.send(map[string]string{"op": "sub", "topic": "world"})
	ada.expect("history")
	bo.send(map[string]string{"op": "sub", "topic": "world"})
	bo.expect("history")
	if code := publish(t, srv, `{"topic":"world","event":"world:day","data":{"day":5}}`, testSecret); code != 200 {
		t.Fatalf("publish: %d", code)
	}
	for _, c := range []*client{ada, bo} {
		m := c.expect("event")
		if m["event"] != "world:day" || m["data"].(map[string]any)["day"].(float64) != 5 {
			t.Fatalf("bad event: %v", m)
		}
	}
	// Unsigned publish is refused.
	if code := publish(t, srv, `{"topic":"world","event":"x"}`, []byte("wrong")); code != 401 {
		t.Fatalf("unsigned publish: %d", code)
	}

	// Presence on a campus: Bo visits Ada's grounds.
	ada.send(map[string]string{"op": "sub", "topic": "campus:c-ada"})
	ada.expect("history")
	bo.send(map[string]string{"op": "sub", "topic": "campus:c-ada"})
	var members []any
	for len(members) < 2 {
		members = ada.expect("presence")["members"].([]any)
	}

	// Chat on the campus, with history for late joiners.
	bo.send(map[string]string{"op": "say", "topic": "campus:c-ada", "text": "  nice   pitch "})
	m := ada.expect("chat")
	if m["text"] != "nice pitch" || m["from"].(map[string]any)["name"] != "Bo" {
		t.Fatalf("bad chat: %v", m)
	}
	cy := dial(t, srv, Claims{UserID: "cy", Name: "Cy"})
	cy.send(map[string]string{"op": "sub", "topic": "campus:c-ada"})
	if h := cy.expect("history")["messages"].([]any); len(h) != 1 {
		t.Fatalf("history: %v", h)
	}

	// Rate limit: the burst is 5 messages.
	for i := 0; i < 6; i++ {
		bo.send(map[string]string{"op": "say", "topic": "campus:c-ada", "text": fmt.Sprintf("hello number %d", i)})
	}
	if m := bo.expect("error"); m["message"] != "Slow down a little." {
		t.Fatalf("no rate limit: %v", m)
	}

	if n := hub.Online(); n != 3 {
		t.Fatalf("online = %d", n)
	}
	_ = cy.ws.Close(websocket.StatusNormalClosure, "")
	deadline := time.Now().Add(2 * time.Second)
	for hub.Online() != 2 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if n := hub.Online(); n != 2 {
		t.Fatalf("online after leave = %d", n)
	}
}

func TestBadTicketRefused(t *testing.T) {
	srv := httptest.NewServer(newServer(config{secret: testSecret, origins: []string{"*"}}, NewHub()))
	defer srv.Close()
	res, err := http.Get(srv.URL + "/ws?ticket=nope")
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status %d", res.StatusCode)
	}
}
