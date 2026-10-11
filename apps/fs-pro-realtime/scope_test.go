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

// TestAssociationTopicScope proves the association:<id> room is member-only:
// a club in the association may subscribe (and gets chat + presence), an
// outsider is refused, and an empty id is invalid.
func TestAssociationTopicScope(t *testing.T) {
	member := Claims{UserID: "m", Associations: []string{"a1"}}
	outsider := Claims{UserID: "o"}
	admin := Claims{UserID: "boss", Admin: true}

	if !CanJoin(member, "association:a1") {
		t.Fatal("a member must join their association room")
	}
	if CanJoin(outsider, "association:a1") {
		t.Fatal("an outsider must NOT join an association room")
	}
	if !CanJoin(admin, "association:a1") {
		t.Fatal("an admin must join any association room")
	}
	if CanJoin(member, "association:") || CanJoin(member, "association:a2") {
		t.Fatal("empty or foreign association ids must be refused")
	}
	if !CanChat("association:a1") || !hasPresence("association:a1") {
		t.Fatal("association rooms must support chat and presence")
	}

	h := NewHub()
	outsiderConn := &Conn{claims: outsider, topics: map[string]struct{}{}, out: make(chan []byte, sendBuffer)}
	if h.Subscribe(outsiderConn, "association:a1") {
		t.Fatal("hub let an outsider subscribe to an association room")
	}
	memberConn := &Conn{claims: member, topics: map[string]struct{}{}, out: make(chan []byte, sendBuffer)}
	h.Add(memberConn)
	if !h.Subscribe(memberConn, "association:a1") {
		t.Fatal("hub refused a member's association room")
	}
	if got := len(h.Members("association:a1")); got != 1 {
		t.Fatalf("association presence members = %d, want 1", got)
	}
	if !h.Say(memberConn, "association:a1", "hello") {
		t.Fatal("a member must be able to chat in the association room")
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
