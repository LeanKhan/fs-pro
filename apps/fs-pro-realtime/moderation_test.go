package main

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func testMod(requireVerified bool) (*Moderator, *time.Time) {
	clock := time.Unix(1_700_000_000, 0)
	m := newModerator(modConfig{RequireVerified: requireVerified, ReportsToMute: 3, AutoMute: 10 * time.Minute, ExtraWords: []string{"blorpface"}})
	m.now = func() time.Time { return clock }
	return m, &clock
}

func TestContentScreen(t *testing.T) {
	m, _ := testMod(false)
	c := Claims{UserID: "u1", Verified: true}
	blocked := []string{
		"you are a fucking idiot",
		"FUCK this",
		"f.u.c.k",
		"f u c k",
		"fuuuuck",
		"sh1t team",
		"what a b!tch",
		"blorpface!",
		"check www.example.org",
		"visit https://spam.test now",
		"join discord.gg/abc",
		"cheap.xyz",
	}
	for _, text := range blocked {
		// A fresh account each time, so rate limits and the duplicate check stay out of it.
		cc := Claims{UserID: "u-" + text, Verified: true}
		if ok, _ := m.Check(cc, text); ok {
			t.Errorf("%q should be refused", text)
		}
	}
	allowed := []string{
		"good game everyone",
		"nice class from the keeper",
		"Scunthorpe away on Saturday",
		"assist for number 9",
		"bassist",
		"see you at 3.30 pm",
		"1-0 to us!",
		"who's up for a friendly? lol",
	}
	for _, text := range allowed {
		cc := Claims{UserID: "ok-" + text, Verified: true}
		if ok, reason := m.Check(cc, text); !ok {
			t.Errorf("%q refused: %s", text, reason)
		}
	}
	_ = c
}

func TestAdminsSkipTheScreenButNotTheRateLimit(t *testing.T) {
	m, _ := testMod(true)
	a := Claims{UserID: "admin", Admin: true}
	if ok, _ := m.Check(a, "see https://fs-pro.example/news"); !ok {
		t.Error("an admin may post a link")
	}
	for i := 0; i < 10; i++ {
		m.Check(a, "line "+string(rune('a'+i)))
	}
	if ok, _ := m.Check(a, "one more"); ok {
		t.Error("admins are rate limited too")
	}
}

func TestVerifiedEmailToChat(t *testing.T) {
	m, _ := testMod(true)
	if ok, reason := m.Check(Claims{UserID: "new"}, "hello"); ok || !strings.Contains(reason, "Confirm your email") {
		t.Errorf("unconfirmed account chatted: %v %q", ok, reason)
	}
	if ok, _ := m.Check(Claims{UserID: "new", Verified: true}, "hello"); !ok {
		t.Error("confirmed account refused")
	}
	off, _ := testMod(false)
	if ok, _ := off.Check(Claims{UserID: "x"}, "hello"); !ok {
		t.Error("requirement off, still refused")
	}
}

func TestRateLimitIsPerAccountNotPerTab(t *testing.T) {
	m, _ := testMod(false)
	c := Claims{UserID: "tabs", Verified: true}
	allowed := 0
	// Two "tabs" share one account: the burst is 5 in total, not 5 each.
	for i := 0; i < 10; i++ {
		if ok, _ := m.Check(c, "message "+string(rune('a'+i))); ok {
			allowed++
		}
	}
	if allowed != 5 {
		t.Errorf("allowed %d, want 5", allowed)
	}
}

func TestDuplicateLines(t *testing.T) {
	m, clock := testMod(false)
	c := Claims{UserID: "dup", Verified: true}
	if ok, _ := m.Check(c, "Hello there"); !ok {
		t.Fatal("first refused")
	}
	if ok, reason := m.Check(c, "hello THERE"); ok || reason != "You just said that." {
		t.Errorf("duplicate allowed: %v %q", ok, reason)
	}
	*clock = clock.Add(31 * time.Second)
	if ok, _ := m.Check(c, "hello there"); !ok {
		t.Error("after 30s the same line is fine")
	}
}

func TestMuteAndExpiry(t *testing.T) {
	m, clock := testMod(false)
	c := Claims{UserID: "loud", Verified: true}
	m.Mute("loud", 5*time.Minute)
	if ok, reason := m.Check(c, "hi"); ok || !strings.HasPrefix(reason, "You are muted until") {
		t.Errorf("muted player chatted: %v %q", ok, reason)
	}
	*clock = clock.Add(6 * time.Minute)
	if ok, _ := m.Check(c, "hi"); !ok {
		t.Error("mute should have expired")
	}
	m.Mute("loud", time.Hour)
	m.Unmute("loud")
	if ok, _ := m.Check(c, "back again"); !ok {
		t.Error("unmute did not work")
	}
}

// chatterOn joins a connection to a chat topic without a socket.
func chatterOn(h *Hub, c Claims, topic string) *Conn {
	cn := &Conn{hub: h, claims: c, topics: map[string]struct{}{topic: {}}, out: make(chan []byte, 64), done: make(chan struct{})}
	h.mu.Lock()
	h.conns[cn] = struct{}{}
	if h.topics[topic] == nil {
		h.topics[topic] = map[*Conn]struct{}{}
	}
	h.topics[topic][cn] = struct{}{}
	h.mu.Unlock()
	return cn
}

func TestReportsMuteAfterEnoughDifferentPlayers(t *testing.T) {
	h := NewHub()
	h.mod, _ = testMod(false)
	topic := "world"
	author := chatterOn(h, Claims{UserID: "bad", Name: "Badger"}, topic)
	h.Say(author, topic, "an awful thing")
	h.Say(author, topic, "and another")
	h.mu.Lock()
	id := h.history[topic][0].ID
	h.mu.Unlock()

	r1 := chatterOn(h, Claims{UserID: "r1"}, topic)
	r2 := chatterOn(h, Claims{UserID: "r2"}, topic)
	r3 := chatterOn(h, Claims{UserID: "r3"}, topic)

	if msg := h.Report(author, topic, id, ""); !strings.Contains(msg, "yourself") {
		t.Errorf("self report: %q", msg)
	}
	h.Report(r1, topic, id, "rude")
	h.Report(r1, topic, id, "rude again") // same reporter: counts once
	if len(h.mod.Muted()) != 0 {
		t.Fatal("muted after one reporter")
	}
	h.Report(r2, topic, id, "")
	if len(h.mod.Muted()) != 0 {
		t.Fatal("muted after two reporters")
	}
	h.Report(r3, topic, id, "")
	if _, muted := h.mod.Muted()["bad"]; !muted {
		t.Fatal("not muted after three different reporters")
	}
	h.mu.Lock()
	left := len(h.history[topic])
	h.mu.Unlock()
	if left != 0 {
		t.Errorf("the author's lines should be pulled from the history, %d left", left)
	}
	if got := len(h.mod.Reports()); got != 3 {
		t.Errorf("reports = %d, want 3 (the repeat does not count)", got)
	}
	if msg := h.Report(r1, "campus:x", 1, ""); !strings.Contains(msg, "gone") {
		t.Errorf("reporting from a room you are not in: %q", msg)
	}
}

func TestAdminEndpoints(t *testing.T) {
	hub := NewHub()
	srv := httptest.NewServer(newServer(config{addr: ":0", secret: testSecret, origins: []string{"*"}}, hub))
	defer srv.Close()
	post := func(path string, body any, sig bool) (int, map[string]any) {
		b, _ := json.Marshal(body)
		req, _ := http.NewRequest("POST", srv.URL+path, bytes.NewReader(b))
		if sig {
			req.Header.Set("X-Signature", hex.EncodeToString(sign(testSecret, b)))
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		var out map[string]any
		_ = json.NewDecoder(res.Body).Decode(&out)
		return res.StatusCode, out
	}
	if code, _ := post("/admin/mute", map[string]any{"uid": "u1", "minutes": 5}, false); code != http.StatusUnauthorized {
		t.Errorf("unsigned mute: %d", code)
	}
	if code, _ := post("/admin/mute", map[string]any{"uid": "u1", "minutes": 0}, true); code != http.StatusBadRequest {
		t.Errorf("zero minutes: %d", code)
	}
	if code, out := post("/admin/mute", map[string]any{"uid": "u1", "minutes": 5, "purge": true}, true); code != http.StatusOK || out["uid"] != "u1" {
		t.Errorf("mute: %d %v", code, out)
	}
	if _, muted := hub.mod.Muted()["u1"]; !muted {
		t.Error("u1 not muted")
	}
	if code, out := post("/admin/reports", map[string]any{}, true); code != http.StatusOK || out["muted"] == nil {
		t.Errorf("reports: %d %v", code, out)
	}
	if code, _ := post("/admin/unmute", map[string]any{"uid": "u1"}, true); code != http.StatusOK {
		t.Errorf("unmute: %d", code)
	}
	if len(hub.mod.Muted()) != 0 {
		t.Error("still muted after unmute")
	}
}
