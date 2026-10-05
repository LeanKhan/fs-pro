package main

import "testing"

func TestNewsTopics(t *testing.T) {
	c := Claims{UserID: "u"}
	for _, topic := range []string{"town:t1", "region:r1", "country:c1"} {
		if !CanJoin(c, topic) {
			t.Fatalf("can't join %s", topic)
		}
	}
	if CanJoin(c, "town:") || CanJoin(c, "planet:x") {
		t.Fatal("joined a bad topic")
	}
	if !CanChat("town:t1") || CanChat("country:c1") {
		t.Fatal("chat rooms wrong")
	}
	if hasPresence("country:c1") || hasPresence(topicWorld) || !hasPresence("town:t1") {
		t.Fatal("presence on the wrong topics")
	}
}

func TestOnlineCountIsBatched(t *testing.T) {
	h := NewHub()
	a := &Conn{claims: Claims{UserID: "a"}, topics: map[string]struct{}{}}
	b := &Conn{claims: Claims{UserID: "a"}, topics: map[string]struct{}{}}
	h.Add(a)
	h.Add(b)
	if h.Online() != 1 {
		t.Fatalf("one user on two tabs counts once, got %d", h.Online())
	}
	h.flushOnline()
	if h.onlineDirty || h.onlineSentAt != 1 {
		t.Fatal("flush did not record the count")
	}
	h.Remove(a)
	h.Remove(b)
	if h.Online() != 0 {
		t.Fatalf("online after both left = %d", h.Online())
	}
}
