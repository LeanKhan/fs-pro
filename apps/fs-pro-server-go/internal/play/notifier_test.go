package play

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/realtime"
)

// recordingNotifier is a durable Notifier that records calls; err lets a test
// force the durable write to fail.
type recordingNotifier struct {
	calls []DefenseNotice
	err   error
	order *[]string
}

func (r *recordingNotifier) RaidResolved(_ context.Context, _ db.Querier, n DefenseNotice) error {
	if r.order != nil {
		*r.order = append(*r.order, "durable")
	}
	r.calls = append(r.calls, n)
	return r.err
}

// recordingPublisher captures the last Publish arguments.
type recordingPublisher struct {
	topics []string
	event  string
	data   any
	order  *[]string
}

func (p *recordingPublisher) Publish(topics []string, event string, data any) {
	if p.order != nil {
		*p.order = append(*p.order, "publish")
	}
	p.topics, p.event, p.data = topics, event, data
}

func sampleNotice() DefenseNotice {
	shield := time.Date(2026, 10, 10, 12, 30, 0, 0, time.UTC)
	return DefenseNotice{
		RaidID: "raid-1", DefenderID: "def-1", AttackerID: "att-1",
		AttackerName: "Raider FC", AttackerCode: "RFC", FixtureID: "fx-1",
		AttackerGoals: 3, DefenderGoals: 1, Stars: 2,
		StolenCash: 1200, StolenFans: 30, StolenTokens: 4,
		StandingAttacker: 24, StandingDefender: -24,
		ShieldUntil: &shield,
	}
}

// TestRealtimeNotifierDurableThenPublish proves the durable inbox row is
// written first and the raid:resolved event goes to the defender's private
// topic with the documented payload, and the durable write is not skipped.
func TestRealtimeNotifierDurableThenPublish(t *testing.T) {
	var order []string
	durable := &recordingNotifier{order: &order}
	pub := &recordingPublisher{order: &order}
	n := &RealtimeNotifier{durable: durable, publisher: pub}

	if err := n.RaidResolved(context.Background(), nil, sampleNotice()); err != nil {
		t.Fatalf("RaidResolved: %v", err)
	}
	if len(durable.calls) != 1 {
		t.Fatalf("durable calls = %d, want 1", len(durable.calls))
	}
	if len(order) != 2 || order[0] != "durable" || order[1] != "publish" {
		t.Fatalf("order = %v, want durable then publish", order)
	}
	if len(pub.topics) != 1 || pub.topics[0] != "club:def-1" {
		t.Fatalf("topics = %v, want [club:def-1]", pub.topics)
	}
	if pub.event != EventRaidResolved {
		t.Fatalf("event = %q, want %q", pub.event, EventRaidResolved)
	}
	data, ok := pub.data.(map[string]any)
	if !ok {
		t.Fatalf("data type = %T", pub.data)
	}
	if data["raidId"] != "raid-1" || data["stars"] != 2 {
		t.Fatalf("payload missing outcome: %v", data)
	}
	score := data["score"].(map[string]any)
	if score["you"] != 1 || score["them"] != 3 {
		t.Fatalf("score.you must be the defender's: %v", score)
	}
}

// TestRealtimeNotifierDurableFailureSkipsPublish proves a failed durable write
// aborts before the event: a raid that rolls back must not leak a phantom
// notification.
func TestRealtimeNotifierDurableFailureSkipsPublish(t *testing.T) {
	durable := &recordingNotifier{err: context.Canceled}
	pub := &recordingPublisher{}
	n := &RealtimeNotifier{durable: durable, publisher: pub}

	err := n.RaidResolved(context.Background(), nil, sampleNotice())
	if err == nil {
		t.Fatal("the durable error must be returned")
	}
	if pub.event != "" {
		t.Fatalf("publisher ran despite a durable failure: %+v", pub)
	}
}

// TestRealtimeNotifierUnconfiguredIsDurableOnly proves the default (no
// REALTIME_URL/REALTIME_SECRET) path still writes the durable row and does not
// panic or publish.
func TestRealtimeNotifierUnconfiguredIsDurableOnly(t *testing.T) {
	durable := &recordingNotifier{}
	client := realtime.New("", "", slog.Default())
	if client.Enabled() {
		t.Fatal("an unconfigured client must be disabled")
	}
	n := &RealtimeNotifier{durable: durable, publisher: client}
	if err := n.RaidResolved(context.Background(), nil, sampleNotice()); err != nil {
		t.Fatalf("RaidResolved: %v", err)
	}
	if len(durable.calls) != 1 {
		t.Fatalf("durable calls = %d, want 1 (durable-only path)", len(durable.calls))
	}
}

// TestRealtimeNotifierPublishesToGateway is the end-to-end seam test: a real
// *realtime.Client pointed at an httptest gateway, driven through the Notifier,
// posts a signature the gateway's own VerifyBody accepts, on the right topic
// and event, with the raid payload.
func TestRealtimeNotifierPublishesToGateway(t *testing.T) {
	const secret = "notifier-test-secret"
	type received struct {
		body []byte
		sig  string
	}
	got := make(chan received, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		got <- received{body: body, sig: r.Header.Get("X-Signature")}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	durable := &recordingNotifier{}
	n := &RealtimeNotifier{
		durable:   durable,
		publisher: realtime.New(srv.URL, secret, slog.Default()),
	}
	if err := n.RaidResolved(context.Background(), nil, sampleNotice()); err != nil {
		t.Fatalf("RaidResolved: %v", err)
	}
	if len(durable.calls) != 1 {
		t.Fatalf("durable calls = %d, want 1", len(durable.calls))
	}

	var r received
	select {
	case r = <-got:
	case <-time.After(3 * time.Second):
		t.Fatal("the gateway was never called")
	}
	// Verify the header the way apps/fs-pro-realtime/ticket.go VerifyBody does.
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(r.body)
	if want := hex.EncodeToString(mac.Sum(nil)); r.sig != want {
		t.Fatalf("X-Signature = %s, want %s", r.sig, want)
	}
	var env struct {
		Topics []string        `json:"topics"`
		Event  string          `json:"event"`
		Data   json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(r.body, &env); err != nil {
		t.Fatalf("bad body %s: %v", r.body, err)
	}
	if env.Event != "raid:resolved" || len(env.Topics) != 1 || env.Topics[0] != "club:def-1" {
		t.Fatalf("unexpected envelope: %+v", env)
	}
	var data map[string]any
	if err := json.Unmarshal(env.Data, &data); err != nil {
		t.Fatalf("data: %v", err)
	}
	if data["raidId"] != "raid-1" || data["attackerName"] != "Raider FC" {
		t.Fatalf("payload not preserved: %v", data)
	}
}

// TestRaidResolvedPayloadShape pins the payload the events.go contract
// documents, including the optional keys being omitted when absent.
func TestRaidResolvedPayloadShape(t *testing.T) {
	p := RaidResolvedPayload(sampleNotice())
	for _, key := range []string{"raidId", "practice", "stars", "score", "stolen", "standing", "fixtureId", "shieldUntil"} {
		if _, ok := p[key]; !ok {
			t.Fatalf("payload is missing %q: %v", key, p)
		}
	}
	if _, ok := p["guardUntil"]; ok {
		t.Fatal("guardUntil must be omitted when nil (granted by the sweep)")
	}
	if p["shieldUntil"] != "2026-10-10T12:30:00.000Z" {
		t.Fatalf("shieldUntil = %v, want an ISO-8601 UTC timestamp", p["shieldUntil"])
	}
	// A notice without a fixture or shield has neither optional key.
	bare := RaidResolvedPayload(DefenseNotice{RaidID: "r", DefenderID: "d", Practice: true})
	if _, ok := bare["fixtureId"]; ok {
		t.Fatal("fixtureId must be omitted when empty")
	}
	if _, ok := bare["shieldUntil"]; ok {
		t.Fatal("shieldUntil must be omitted when nil")
	}
}
