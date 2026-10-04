package main

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/coder/websocket"
)

const (
	sendBuffer   = 64
	pingEvery    = 30 * time.Second
	writeTimeout = 10 * time.Second
	maxChatChars = 280
	maxFrame     = 4 << 10
)

// Conn is one browser tab.
type Conn struct {
	hub    *Hub
	ws     *websocket.Conn
	claims Claims
	topics map[string]struct{} // guarded by hub.mu
	out    chan []byte
	once   sync.Once
	done   chan struct{}
	chat   *bucket
}

func newConn(hub *Hub, ws *websocket.Conn, claims Claims) *Conn {
	return &Conn{
		hub:    hub,
		ws:     ws,
		claims: claims,
		topics: map[string]struct{}{},
		out:    make(chan []byte, sendBuffer),
		done:   make(chan struct{}),
		// 5 messages at once, then one every 2 seconds.
		chat: newBucket(5, 2*time.Second),
	}
}

func (c *Conn) member() Member {
	return Member{UserID: c.claims.UserID, Name: c.claims.Name, Code: c.claims.Code}
}

// Send queues a message; a client too slow to keep up is dropped rather
// than slowing everyone else down.
func (c *Conn) Send(msg any) {
	b, err := json.Marshal(msg)
	if err == nil {
		c.SendRaw(b)
	}
}

func (c *Conn) SendRaw(b []byte) {
	select {
	case <-c.done:
	case c.out <- b:
	default:
		c.close(websocket.StatusPolicyViolation, "too slow")
	}
}

func (c *Conn) close(code websocket.StatusCode, reason string) {
	c.once.Do(func() {
		close(c.done)
		_ = c.ws.Close(code, reason)
	})
}

type inbound struct {
	Op    string `json:"op"`
	Topic string `json:"topic"`
	Text  string `json:"text"`
}

// Run serves the connection until it closes.
func (c *Conn) Run(ctx context.Context) {
	c.ws.SetReadLimit(maxFrame)
	c.hub.Add(c)
	defer c.hub.Remove(c)
	defer c.close(websocket.StatusNormalClosure, "")

	c.Send(map[string]any{"type": "hello", "you": c.member(), "online": c.hub.Online()})
	go c.writeLoop(ctx)

	for {
		var msg inbound
		_, data, err := c.ws.Read(ctx)
		if err != nil {
			return
		}
		if json.Unmarshal(data, &msg) != nil {
			c.Send(map[string]any{"type": "error", "message": "bad message"})
			continue
		}
		c.handle(msg)
	}
}

func (c *Conn) handle(msg inbound) {
	switch msg.Op {
	case "sub":
		if !c.hub.Subscribe(c, msg.Topic) {
			c.Send(map[string]any{"type": "error", "topic": msg.Topic, "message": "not allowed"})
		}
	case "unsub":
		c.hub.Unsubscribe(c, msg.Topic)
	case "say":
		text := cleanChat(msg.Text)
		if text == "" {
			return
		}
		if !c.chat.take(time.Now()) {
			c.Send(map[string]any{"type": "error", "topic": msg.Topic, "message": "slow down"})
			return
		}
		if !c.hub.Say(c, msg.Topic, text) {
			c.Send(map[string]any{"type": "error", "topic": msg.Topic, "message": "not allowed"})
		}
	case "ping":
		c.Send(map[string]any{"type": "pong"})
	}
}

func (c *Conn) writeLoop(ctx context.Context) {
	ping := time.NewTicker(pingEvery)
	defer ping.Stop()
	for {
		select {
		case <-c.done:
			return
		case <-ctx.Done():
			return
		case b := <-c.out:
			wctx, cancel := context.WithTimeout(ctx, writeTimeout)
			err := c.ws.Write(wctx, websocket.MessageText, b)
			cancel()
			if err != nil {
				c.close(websocket.StatusGoingAway, "write failed")
				return
			}
		case <-ping.C:
			pctx, cancel := context.WithTimeout(ctx, writeTimeout)
			err := c.ws.Ping(pctx)
			cancel()
			if err != nil {
				c.close(websocket.StatusGoingAway, "ping failed")
				return
			}
		}
	}
}

// cleanChat trims, collapses whitespace, drops control characters and caps
// the length (in characters, not bytes).
func cleanChat(s string) string {
	s = strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return ' '
		}
		return r
	}, s)
	s = strings.Join(strings.Fields(s), " ")
	if utf8.RuneCountInString(s) > maxChatChars {
		s = string([]rune(s)[:maxChatChars])
	}
	return s
}

// bucket is a token bucket rate limit.
type bucket struct {
	mu     sync.Mutex
	tokens float64
	max    float64
	every  time.Duration
	last   time.Time
}

func newBucket(max int, every time.Duration) *bucket {
	return &bucket{tokens: float64(max), max: float64(max), every: every}
}

func (b *bucket) take(now time.Time) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	if !b.last.IsZero() {
		b.tokens += float64(now.Sub(b.last)) / float64(b.every)
		if b.tokens > b.max {
			b.tokens = b.max
		}
	}
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}
