package main

import (
	"encoding/json"
	"sort"
	"strings"
	"sync"
	"time"
)

// Topics:
//
//	world          everyone: world events, the world chat and the online count
//	club:<id>      the club's owner only: challenges, inbox, upgrades finishing
//	campus:<id>    anyone: who is looking at a club's grounds right now, and
//	               the chat there
//	edition:<id>   anyone: one competition edition's tables and draws
//	fixture:<id>   anyone: one match
//	town:<id>      anyone: a town's news and its chat
//	region:<id>    anyone: a region's news
//	country:<id>   anyone: a country's news
//
// News is scoped (docs/WORLD-PYRAMID-SPEC.md, "News scopes"): the API posts
// a story to the smallest place that holds its clubs and to the wider ones
// it earns, so the world topic only carries the biggest stories. Member
// lists are only kept for small rooms (campus, town); the world gets an
// online count at most every onlineEvery.
const (
	topicWorld       = "world"
	historyPerTopic  = 50
	maxTopicsPerConn = 32
	onlineEvery      = 10 * time.Second
)

// Member is how a connection shows up in a topic's presence list.
type Member struct {
	UserID string `json:"uid"`
	Name   string `json:"name"`
	Code   string `json:"code,omitempty"`
}

// ChatMessage is one line of chat on a topic.
type ChatMessage struct {
	Type  string `json:"type"`
	Topic string `json:"topic"`
	ID    int64  `json:"id"`
	From  Member `json:"from"`
	Text  string `json:"text"`
	At    int64  `json:"at"`
}

// Hub holds every connection and which topics it follows. One mutex is
// plenty at the scale of one world; a multi-node setup would put a broker
// (Redis pub/sub, NATS) behind Publish without changing the clients.
type Hub struct {
	mu      sync.Mutex
	conns   map[*Conn]struct{}
	topics  map[string]map[*Conn]struct{}
	history map[string][]ChatMessage
	// Connections per signed-in user, kept as connections come and go so
	// the online count is O(1).
	users        map[string]int
	onlineDirty  bool
	onlineSentAt int
	nextID       int64
	now          func() time.Time
	mod          *Moderator
}

func NewHub() *Hub {
	return &Hub{
		conns:   map[*Conn]struct{}{},
		topics:  map[string]map[*Conn]struct{}{},
		history: map[string][]ChatMessage{},
		users:   map[string]int{},
		now:     time.Now,
		mod:     newModerator(modConfig{ReportsToMute: 3, AutoMute: 10 * time.Minute}),
	}
}

// CanJoin reports whether claims may follow topic.
func CanJoin(c Claims, topic string) bool {
	kind, id, _ := strings.Cut(topic, ":")
	switch {
	case topic == topicWorld:
		return true
	case kind == "club":
		return id != "" && (c.Admin || c.ownsClub(id))
	case kind == "campus", kind == "edition", kind == "fixture",
		kind == "town", kind == "region", kind == "country":
		return id != "" && len(id) <= 64
	}
	return false
}

// CanChat reports whether topic has a chat.
func CanChat(topic string) bool {
	return topic == topicWorld || strings.HasPrefix(topic, "campus:") || strings.HasPrefix(topic, "town:")
}

// hasPresence reports whether topic keeps a member list: only small rooms,
// so joining a busy topic never costs a message per member.
func hasPresence(topic string) bool {
	return strings.HasPrefix(topic, "campus:") || strings.HasPrefix(topic, "town:")
}

func (h *Hub) Add(c *Conn) {
	h.mu.Lock()
	h.conns[c] = struct{}{}
	h.users[c.claims.UserID]++
	h.onlineDirty = true
	h.mu.Unlock()
}

func (h *Hub) Remove(c *Conn) {
	h.mu.Lock()
	delete(h.conns, c)
	if h.users[c.claims.UserID]--; h.users[c.claims.UserID] <= 0 {
		delete(h.users, c.claims.UserID)
	}
	h.onlineDirty = true
	var left []string
	for topic, members := range h.topics {
		if _, ok := members[c]; ok {
			delete(members, c)
			left = append(left, topic)
			if len(members) == 0 {
				delete(h.topics, topic)
			}
		}
	}
	h.mu.Unlock()
	for _, t := range left {
		h.broadcastPresence(t)
	}
}

// Subscribe adds c to topic and sends it the topic's chat history.
func (h *Hub) Subscribe(c *Conn, topic string) bool {
	if !CanJoin(c.claims, topic) {
		return false
	}
	h.mu.Lock()
	if len(c.topics) >= maxTopicsPerConn {
		h.mu.Unlock()
		return false
	}
	members := h.topics[topic]
	if members == nil {
		members = map[*Conn]struct{}{}
		h.topics[topic] = members
	}
	members[c] = struct{}{}
	c.topics[topic] = struct{}{}
	history := append([]ChatMessage(nil), h.history[topic]...)
	h.mu.Unlock()

	if CanChat(topic) {
		c.Send(map[string]any{"type": "history", "topic": topic, "messages": history})
	}
	h.broadcastPresence(topic)
	return true
}

func (h *Hub) Unsubscribe(c *Conn, topic string) {
	h.mu.Lock()
	delete(c.topics, topic)
	if members := h.topics[topic]; members != nil {
		delete(members, c)
		if len(members) == 0 {
			delete(h.topics, topic)
		}
	}
	h.mu.Unlock()
	h.broadcastPresence(topic)
}

// Publish sends a domain event to everyone on topic.
func (h *Hub) Publish(topic, event string, data json.RawMessage) int {
	msg := map[string]any{"type": "event", "topic": topic, "event": event, "data": data}
	return h.send(topic, msg)
}

// Say posts chat from c on topic (the caller has checked rate limits).
func (h *Hub) Say(c *Conn, topic, text string) bool {
	if !CanChat(topic) {
		return false
	}
	h.mu.Lock()
	if _, ok := c.topics[topic]; !ok {
		h.mu.Unlock()
		return false
	}
	h.nextID++
	msg := ChatMessage{Type: "chat", Topic: topic, ID: h.nextID, From: c.member(), Text: text, At: h.now().UnixMilli()}
	hist := append(h.history[topic], msg)
	if len(hist) > historyPerTopic {
		hist = hist[len(hist)-historyPerTopic:]
	}
	h.history[topic] = hist
	h.mu.Unlock()
	h.send(topic, msg)
	return true
}

func (h *Hub) send(topic string, msg any) int {
	b, err := json.Marshal(msg)
	if err != nil {
		return 0
	}
	h.mu.Lock()
	targets := make([]*Conn, 0, len(h.topics[topic]))
	for c := range h.topics[topic] {
		targets = append(targets, c)
	}
	h.mu.Unlock()
	for _, c := range targets {
		c.SendRaw(b)
	}
	return len(targets)
}

// Members lists the distinct users on topic, sorted by name.
func (h *Hub) Members(topic string) []Member {
	h.mu.Lock()
	seen := map[string]Member{}
	for c := range h.topics[topic] {
		seen[c.claims.UserID] = c.member()
	}
	h.mu.Unlock()
	out := make([]Member, 0, len(seen))
	for _, m := range seen {
		out = append(out, m)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// Online counts distinct signed-in users.
func (h *Hub) Online() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.users)
}

// Small rooms get the member list on every change; big topics get none.
func (h *Hub) broadcastPresence(topic string) {
	if !hasPresence(topic) {
		return
	}
	h.send(topic, map[string]any{"type": "presence", "topic": topic, "members": h.Members(topic)})
}

// flushOnline sends the online count to the world if it changed since the
// last send. RunOnline calls it every onlineEvery, so connections coming
// and going cost nothing per connection.
func (h *Hub) flushOnline() {
	h.mu.Lock()
	n := len(h.users)
	changed := h.onlineDirty && n != h.onlineSentAt
	h.onlineDirty = false
	if changed {
		h.onlineSentAt = n
	}
	h.mu.Unlock()
	if changed {
		h.send(topicWorld, map[string]any{"type": "online", "count": n})
	}
}

// RunOnline sends the online count every onlineEvery until stop closes.
func (h *Hub) RunOnline(stop <-chan struct{}) {
	t := time.NewTicker(onlineEvery)
	defer t.Stop()
	for {
		select {
		case <-stop:
			return
		case <-t.C:
			h.flushOnline()
		}
	}
}

// Stats is for /stats.
func (h *Hub) Stats() map[string]any {
	h.mu.Lock()
	topics := map[string]int{}
	for t, m := range h.topics {
		topics[t] = len(m)
	}
	conns := len(h.conns)
	h.mu.Unlock()
	return map[string]any{"connections": conns, "online": h.Online(), "topics": topics}
}
