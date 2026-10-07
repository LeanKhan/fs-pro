package main

import (
	"bufio"
	"fmt"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
)

// Chat moderation. The gateway keeps no database, so everything here lives
// in memory and is lost on restart; that is fine for mutes of minutes and a
// report queue, and the logs keep the record.
//
// What it does, in order, for every line a player says:
//
//  1. a muted player is told until when, and the line is dropped
//  2. unconfirmed accounts can read but not write (ticket claim "ver")
//  3. a per-player rate limit, so several tabs don't multiply it
//  4. the line is screened (admins skip this): links, repeated lines and a
//     word list
//
// Players can report a line; enough different reporters mute its author
// for a while and pull their lines from the history. Moderators act through
// the signed /admin endpoints (main.go).

// modConfig is read from the environment (loadModConfig).
type modConfig struct {
	// RequireVerified: only accounts with a confirmed email may chat.
	RequireVerified bool
	// ReportsToMute is how many different players must report a line.
	ReportsToMute int
	// AutoMute is how long the automatic mute lasts.
	AutoMute time.Duration
	// ExtraWords are added to the built-in list (CHAT_BLOCKLIST, CHAT_BLOCKLIST_FILE).
	ExtraWords []string
}

func loadModConfig() modConfig {
	cfg := modConfig{
		RequireVerified: strings.TrimSpace(os.Getenv("CHAT_REQUIRE_VERIFIED")) != "false",
		ReportsToMute:   3,
		AutoMute:        10 * time.Minute,
	}
	if v, err := strconv.Atoi(strings.TrimSpace(os.Getenv("CHAT_REPORTS_TO_MUTE"))); err == nil && v > 0 {
		cfg.ReportsToMute = v
	}
	for _, w := range strings.Split(os.Getenv("CHAT_BLOCKLIST"), ",") {
		if w = strings.TrimSpace(w); w != "" {
			cfg.ExtraWords = append(cfg.ExtraWords, w)
		}
	}
	if path := strings.TrimSpace(os.Getenv("CHAT_BLOCKLIST_FILE")); path != "" {
		if f, err := os.Open(path); err == nil {
			defer f.Close()
			sc := bufio.NewScanner(f)
			for sc.Scan() {
				if w := strings.TrimSpace(sc.Text()); w != "" && !strings.HasPrefix(w, "#") {
					cfg.ExtraWords = append(cfg.ExtraWords, w)
				}
			}
		} else {
			fmt.Fprintf(os.Stderr, "chat: cannot read CHAT_BLOCKLIST_FILE: %v\n", err)
		}
	}
	return cfg
}

// builtinWords is a short baseline of common profanity. It is deliberately
// not a complete list: a real one, with slurs, belongs to the operator
// (CHAT_BLOCKLIST_FILE) and is easy to tune without a release.
var builtinWords = []string{
	"fuck", "fucking", "fucker", "motherfucker", "shit", "bullshit", "bitch", "bastard",
	"asshole", "dick", "cunt", "wanker", "twat", "piss", "slut", "whore",
}

// Report is one player's complaint about one line.
type Report struct {
	At       int64  `json:"at"`
	Topic    string `json:"topic"`
	Message  int64  `json:"message"`
	Text     string `json:"text"`
	Author   Member `json:"author"`
	Reporter string `json:"reporter"`
	Reason   string `json:"reason,omitempty"`
}

type lastLine struct {
	text string
	at   time.Time
}

// Moderator screens chat and keeps mutes and reports.
type Moderator struct {
	cfg modConfig
	now func() time.Time
	// words are normalised (see normalize); compact is the same list with
	// spaces removed, for catching "f u c k".
	words map[string]struct{}

	mu        sync.Mutex
	buckets   map[string]*bucket
	muted     map[string]time.Time
	last      map[string]lastLine
	reports   []Report
	reporters map[string]map[string]struct{} // "topic|id" -> reporter uids
	reportRL  map[string]*bucket
}

const maxReports = 200

func newModerator(cfg modConfig) *Moderator {
	m := &Moderator{
		cfg:       cfg,
		now:       time.Now,
		words:     map[string]struct{}{},
		buckets:   map[string]*bucket{},
		muted:     map[string]time.Time{},
		last:      map[string]lastLine{},
		reporters: map[string]map[string]struct{}{},
		reportRL:  map[string]*bucket{},
	}
	for _, w := range append(append([]string{}, builtinWords...), cfg.ExtraWords...) {
		if n := normalize(w); n != "" {
			m.words[n] = struct{}{}
		}
	}
	return m
}

// Check decides whether claims may post text now. When it refuses, reason
// is shown to the player.
func (m *Moderator) Check(c Claims, text string) (ok bool, reason string) {
	now := m.now()
	m.mu.Lock()
	defer m.mu.Unlock()

	if until, muted := m.muted[c.UserID]; muted {
		if now.Before(until) {
			return false, "You are muted until " + until.Local().Format("15:04") + "."
		}
		delete(m.muted, c.UserID)
	}
	if m.cfg.RequireVerified && !c.Verified && !c.Admin {
		return false, "Confirm your email to chat. Open the link we sent you, or ask for a new one in Settings."
	}
	b := m.buckets[c.UserID]
	if b == nil {
		b = newBucket(5, 2*time.Second)
		m.buckets[c.UserID] = b
	}
	if !b.take(now) {
		return false, "Slow down a little."
	}
	if c.Admin {
		return true, ""
	}
	if containsLink(text) {
		return false, "Links aren't allowed in chat."
	}
	if prev, seen := m.last[c.UserID]; seen && prev.text == strings.ToLower(text) && now.Sub(prev.at) < 30*time.Second {
		return false, "You just said that."
	}
	if m.blocked(text) {
		return false, "Please keep chat friendly."
	}
	m.last[c.UserID] = lastLine{text: strings.ToLower(text), at: now}
	return true, ""
}

var linkPattern = regexp.MustCompile(`(?i)(https?:|www\.|\b[a-z0-9-]+\.(com|net|org|io|gg|me|co|xyz|ru|cn|tk|ly|app|dev|link|info)\b|discord\.gg|t\.me)`)

func containsLink(s string) bool { return linkPattern.MatchString(s) }

// leetDigits stand in for letters anywhere; leetSymbols only inside a word
// ("sh!t"), so "fuck!" keeps its exclamation mark as punctuation.
var (
	leetDigits  = map[rune]rune{'0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't'}
	leetSymbols = map[rune]rune{'@': 'a', '$': 's', '!': 'i', '+': 't'}
)

// normalize lower-cases, undoes common look-alikes and collapses repeated
// letters ("fuuuck" -> "fuck"), keeping spaces between words.
func normalize(s string) string {
	in := []rune(strings.ToLower(s))
	wordy := func(i int) bool {
		if i < 0 || i >= len(in) {
			return false
		}
		r := in[i]
		_, d := leetDigits[r]
		return unicode.IsLetter(r) || d
	}
	var b strings.Builder
	var prev rune
	for i, r := range in {
		if l, ok := leetDigits[r]; ok {
			r = l
		} else if l, ok := leetSymbols[r]; ok && wordy(i-1) && wordy(i+1) {
			r = l
		}
		switch {
		case unicode.IsLetter(r):
			if r == prev {
				continue
			}
			b.WriteRune(r)
			prev = r
		default:
			if prev != ' ' {
				b.WriteRune(' ')
			}
			prev = ' '
		}
	}
	return strings.TrimSpace(b.String())
}

// blocked reports whether text contains a listed word, as a whole word (so
// "class" and "Scunthorpe" pass) or spelled out with separators ("f.u.c.k").
func (m *Moderator) blocked(text string) bool {
	norm := normalize(text)
	if norm == "" {
		return false
	}
	tokens := strings.Fields(norm)
	for _, t := range tokens {
		if _, bad := m.words[t]; bad {
			return true
		}
	}
	// Single letters run together: "f u c k" or "f.u.c.k".
	var run strings.Builder
	flush := func() bool {
		if run.Len() >= 3 {
			if _, bad := m.words[run.String()]; bad {
				return true
			}
		}
		run.Reset()
		return false
	}
	for _, t := range tokens {
		if len([]rune(t)) == 1 {
			run.WriteString(t)
			continue
		}
		if flush() {
			return true
		}
	}
	return flush()
}

// Mute silences uid until the duration has passed.
func (m *Moderator) Mute(uid string, d time.Duration) time.Time {
	until := m.now().Add(d)
	m.mu.Lock()
	m.muted[uid] = until
	m.mu.Unlock()
	return until
}

func (m *Moderator) Unmute(uid string) {
	m.mu.Lock()
	delete(m.muted, uid)
	m.mu.Unlock()
}

// Muted lists current mutes (uid -> until, unix ms).
func (m *Moderator) Muted() map[string]int64 {
	now := m.now()
	m.mu.Lock()
	defer m.mu.Unlock()
	out := map[string]int64{}
	for uid, until := range m.muted {
		if now.Before(until) {
			out[uid] = until.UnixMilli()
		}
	}
	return out
}

// AllowReport rate-limits reporting itself: 5 a minute per player.
func (m *Moderator) AllowReport(uid string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	b := m.reportRL[uid]
	if b == nil {
		b = newBucket(5, 12*time.Second)
		m.reportRL[uid] = b
	}
	return b.take(m.now())
}

// AddReport records a complaint and says whether the line has now been
// reported by enough different players to mute its author.
func (m *Moderator) AddReport(r Report) (count int, mute bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := r.Topic + "|" + strconv.FormatInt(r.Message, 10)
	set := m.reporters[key]
	if set == nil {
		set = map[string]struct{}{}
		m.reporters[key] = set
	}
	if _, dup := set[r.Reporter]; dup {
		return len(set), false
	}
	set[r.Reporter] = struct{}{}
	m.reports = append(m.reports, r)
	if len(m.reports) > maxReports {
		m.reports = m.reports[len(m.reports)-maxReports:]
	}
	fmt.Fprintf(os.Stderr, "chat report: %s reported %s (%s) on %s: %q\n", r.Reporter, r.Author.Name, r.Author.UserID, r.Topic, r.Text)
	return len(set), len(set) >= m.cfg.ReportsToMute
}

// Reports returns the recent reports, newest first.
func (m *Moderator) Reports() []Report {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := append([]Report(nil), m.reports...)
	sort.Slice(out, func(i, j int) bool { return out[i].At > out[j].At })
	return out
}

// Sweep forgets stale per-player state; the hub calls it now and then.
func (m *Moderator) Sweep() {
	now := m.now()
	m.mu.Lock()
	defer m.mu.Unlock()
	for uid, until := range m.muted {
		if !now.Before(until) {
			delete(m.muted, uid)
		}
	}
	for uid, l := range m.last {
		if now.Sub(l.at) > time.Minute {
			delete(m.last, uid)
		}
	}
	for uid, b := range m.buckets {
		b.mu.Lock()
		idle := !b.last.IsZero() && now.Sub(b.last) > 10*time.Minute
		b.mu.Unlock()
		if idle {
			delete(m.buckets, uid)
		}
	}
}
