package main

import (
	"strings"
	"time"
)

// Hub side of moderation: reports and pulling a muted player's lines.

// Report files a complaint from c about chat line id on topic. It returns
// the sentence to show the reporter.
func (h *Hub) Report(c *Conn, topic string, id int64, reason string) string {
	if !CanChat(topic) || id <= 0 {
		return "That line can't be reported."
	}
	if !h.mod.AllowReport(c.claims.UserID) {
		return "You're reporting too fast. Try again in a moment."
	}
	h.mu.Lock()
	_, inRoom := c.topics[topic]
	var found *ChatMessage
	if inRoom {
		for i := range h.history[topic] {
			if h.history[topic][i].ID == id {
				m := h.history[topic][i]
				found = &m
				break
			}
		}
	}
	h.mu.Unlock()
	if found == nil {
		return "That line is gone already."
	}
	if found.From.UserID == c.claims.UserID {
		return "You can't report yourself."
	}
	reason = cleanChat(reason)
	if len([]rune(reason)) > 80 {
		reason = string([]rune(reason)[:80])
	}
	count, mute := h.mod.AddReport(Report{
		At:       h.now().UnixMilli(),
		Topic:    topic,
		Message:  id,
		Text:     found.Text,
		Author:   found.From,
		Reporter: c.claims.UserID,
		Reason:   reason,
	})
	if mute {
		until := h.mod.Mute(found.From.UserID, h.mod.cfg.AutoMute)
		h.Purge(found.From.UserID)
		h.notify(found.From.UserID, "You were muted until "+until.Local().Format("15:04")+" after other players reported your messages.")
	}
	if count > 1 && !mute {
		return "Thanks, we've noted it."
	}
	return "Thanks, we'll look at it."
}

// Purge removes every chat line by uid from the histories and tells the
// rooms, so clients drop them.
func (h *Hub) Purge(uid string) {
	type removed struct {
		topic string
		ids   []int64
	}
	var gone []removed
	h.mu.Lock()
	for topic, msgs := range h.history {
		kept := msgs[:0:0]
		var ids []int64
		for _, m := range msgs {
			if m.From.UserID == uid {
				ids = append(ids, m.ID)
			} else {
				kept = append(kept, m)
			}
		}
		if len(ids) > 0 {
			h.history[topic] = kept
			gone = append(gone, removed{topic, ids})
		}
	}
	h.mu.Unlock()
	for _, g := range gone {
		h.send(g.topic, map[string]any{"type": "removed", "topic": g.topic, "ids": g.ids})
	}
}

// notify sends a message to every open connection of uid.
func (h *Hub) notify(uid, message string) {
	h.mu.Lock()
	var targets []*Conn
	for c := range h.conns {
		if c.claims.UserID == uid {
			targets = append(targets, c)
		}
	}
	h.mu.Unlock()
	for _, c := range targets {
		c.Send(map[string]any{"type": "error", "message": message})
	}
}

// AdminMute mutes uid for d (and removes their lines when purge is set).
func (h *Hub) AdminMute(uid string, d time.Duration, purge bool) time.Time {
	until := h.mod.Mute(strings.TrimSpace(uid), d)
	if purge {
		h.Purge(uid)
	}
	h.notify(uid, "You were muted until "+until.Local().Format("15:04")+" by a moderator.")
	return until
}
