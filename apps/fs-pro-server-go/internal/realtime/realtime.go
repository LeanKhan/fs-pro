// Package realtime is the Go publisher for the fs-pro realtime gateway
// (apps/fs-pro-realtime). It is the mirror of the Node signer
// (apps/fs-pro-server/src/realtime/world-events.ts): a fire-and-forget,
// signed POST to POST {REALTIME_URL}/publish with body
// {"topics":[...],"event":"...","data":{...}} and header
// X-Signature: hex(hmac-sha256(REALTIME_SECRET, body)).
//
// On the hot path a publish never blocks and never fails a game write: it
// returns immediately, the POST runs in the background with a short timeout,
// and any failure is logged (rate-limited) rather than returned. A client
// without a url or secret is disabled and silently no-ops, so callers never
// have to branch on whether realtime is configured.
package realtime

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	// DefaultTimeout bounds one publish POST. The Node signer uses 2s.
	DefaultTimeout = 2 * time.Second
	// failureLogEvery rate-limits the "gateway unreachable" warning, matching
	// the Node signer's once-a-minute throttle so a down gateway cannot flood
	// the logs from a busy worker.
	failureLogEvery = time.Minute
	// maxResponseBytes is how much of the gateway's reply we bother to drain
	// (its {"delivered":n} body is tiny) so the connection can be reused.
	maxResponseBytes = 1 << 16
)

// Client posts signed events to the realtime gateway. It is safe for concurrent
// use and cheap to copy-by-pointer. A zero Client is disabled.
type Client struct {
	url     string
	secret  []byte
	http    *http.Client
	log     *slog.Logger
	timeout time.Duration

	mu          sync.Mutex
	lastFailure time.Time
}

// New builds a client from REALTIME_URL and REALTIME_SECRET. A trailing slash
// on the url is dropped. An empty url, an empty secret, or the documented
// "off" url yields a disabled client that no-ops on Publish.
func New(url, secret string, logger *slog.Logger) *Client {
	if logger == nil {
		logger = slog.Default()
	}
	return &Client{
		url:     strings.TrimRight(strings.TrimSpace(url), "/"),
		secret:  []byte(secret),
		http:    &http.Client{Timeout: DefaultTimeout},
		log:     logger,
		timeout: DefaultTimeout,
	}
}

// Enabled reports whether a url and secret are configured. Callers that want to
// log the wiring can branch on it; Publish itself already no-ops when disabled.
func (c *Client) Enabled() bool {
	return c != nil && c.url != "" && c.url != "off" && len(c.secret) > 0
}

// publishBody is the wire shape the gateway verifies and relays. The field
// order matches the Node signer's JSON.stringify({ topics, event, data }).
type publishBody struct {
	Topics []string `json:"topics"`
	Event  string   `json:"event"`
	Data   any      `json:"data"`
}

// Sign returns the gateway's X-Signature: lowercase hex HMAC-SHA256 of body,
// keyed by secret. It is exported so tests and tooling can reproduce the
// gateway's VerifyBody against the exact bytes the client sends.
func Sign(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// buildBody marshals the exact JSON bytes the gateway's signature check sees.
func buildBody(topics []string, event string, data any) ([]byte, error) {
	if event == "" {
		return nil, fmt.Errorf("realtime: event is required")
	}
	if len(topics) == 0 {
		return nil, fmt.Errorf("realtime: at least one topic is required")
	}
	return json.Marshal(publishBody{Topics: topics, Event: event, Data: data})
}

// Publish signs and posts event to each topic. It is fire-and-forget: it
// returns as soon as the body is encoded and never blocks or returns an error,
// so a game write is never delayed or failed by the gateway. Failures are
// logged (rate-limited).
func (c *Client) Publish(topics []string, event string, data any) {
	if !c.Enabled() {
		return
	}
	body, err := buildBody(topics, event, data)
	if err != nil {
		publishDropped.Inc()
		c.log.Warn("realtime: dropped event", "event", event, "err", err)
		return
	}
	publishAttempts.Inc()
	go c.post(body, event)
}

// post performs the signed POST in the background with its own short timeout.
func (c *Client) post(body []byte, event string) {
	started := time.Now()
	defer func() { publishSeconds.Observe(time.Since(started).Seconds()) }()
	ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url+"/publish", bytes.NewReader(body))
	if err != nil {
		publishFailure.Inc()
		c.logFailure(event, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Signature", Sign(string(c.secret), body))
	resp, err := c.http.Do(req)
	if err != nil {
		publishFailure.Inc()
		c.logFailure(event, err)
		return
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxResponseBytes))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		publishFailure.Inc()
		c.logFailure(event, fmt.Errorf("HTTP %d", resp.StatusCode))
		return
	}
	publishSuccess.Inc()
}

// logFailure records the first failure in each window; later ones are dropped
// so a long outage is one line a minute, not one line per event.
func (c *Client) logFailure(event string, err error) {
	now := time.Now()
	c.mu.Lock()
	if now.Sub(c.lastFailure) < failureLogEvery {
		c.mu.Unlock()
		return
	}
	c.lastFailure = now
	c.mu.Unlock()
	c.log.Warn("realtime: gateway unreachable", "url", c.url, "event", event, "err", err)
}
