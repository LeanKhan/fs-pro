package main

import (
	"encoding/json"
	"testing"
)

// newTestConn builds a Conn that can receive without a WebSocket: SendRaw
// writes to the buffered out channel. Used to assert delivery scope.
func newTestConn(userID string, clubs ...string) *Conn {
	return &Conn{
		claims: Claims{UserID: userID, Clubs: clubs},
		topics: map[string]struct{}{},
		out:    make(chan []byte, 16),
		done:   make(chan struct{}),
	}
}

// TestRaidResolvedStaysOnTheDefendersClubTopic proves the `raid:resolved` /
// `club:defended` defence notifications are private: only the raided club's
// owner (or an admin) can be joined to `club:<id>`, and a publish there reaches
// that owner and nobody else. This is the transport contract the P5 defence
// worker's `Notifier` seam (internal/play/raid.go) would publish to.
func TestRaidResolvedStaysOnTheDefendersClubTopic(t *testing.T) {
	h := NewHub()
	defender := newTestConn("defender", "club-d")
	outsider := newTestConn("outsider", "club-other")
	h.Add(defender)
	h.Add(outsider)

	// The topic is the documented `club:<id>` scope.
	if got := ClubTopic("club-d"); got != "club:club-d" {
		t.Fatalf("ClubTopic = %q", got)
	}
	if !h.Subscribe(defender, ClubTopic("club-d")) {
		t.Fatal("the defender must join their own club topic")
	}
	if h.Subscribe(outsider, ClubTopic("club-d")) {
		t.Fatal("an outsider must not join another club's topic")
	}
	if !CanJoin(Claims{UserID: "admin", Admin: true}, ClubTopic("club-d")) {
		t.Fatal("an admin must be able to join any club topic")
	}

	// `raid:resolved` reaches exactly the defender.
	payload := json.RawMessage(`{"raidId":"r1","stars":3,"score":{"you":0,"them":3}}`)
	if n := h.Publish(ClubTopic("club-d"), EventRaidResolved, payload); n != 1 {
		t.Fatalf("raid:resolved delivered to %d conns, want 1", n)
	}
	select {
	case raw := <-defender.out:
		var m map[string]any
		if err := json.Unmarshal(raw, &m); err != nil {
			t.Fatalf("bad frame: %v (%s)", err, raw)
		}
		if m["type"] != "event" || m["topic"] != "club:club-d" || m["event"] != EventRaidResolved {
			t.Fatalf("unexpected frame: %v", m)
		}
		if data := m["data"].(map[string]any); data["raidId"] != "r1" || data["stars"].(float64) != 3 {
			t.Fatalf("payload not preserved: %v", m["data"])
		}
	default:
		t.Fatal("the defender received no raid:resolved frame")
	}
	select {
	case raw := <-outsider.out:
		t.Fatalf("an outsider received a private defence event: %s", raw)
	default:
	}

	// The pre-P5 name rides the same private topic (cutover compatibility).
	if n := h.Publish(ClubTopic("club-d"), EventClubDefended, json.RawMessage(`{"raidId":"r1"}`)); n != 1 {
		t.Fatalf("club:defended delivered to %d conns, want 1", n)
	}
	select {
	case raw := <-defender.out:
		var m map[string]any
		_ = json.Unmarshal(raw, &m)
		if m["event"] != EventClubDefended {
			t.Fatalf("unexpected club:defended frame: %v", m)
		}
	default:
		t.Fatal("the defender received no club:defended frame")
	}
}
