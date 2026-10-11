package realtime

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// waitFor polls until cond is true or the deadline passes.
func waitFor(t *testing.T, cond func() bool, d time.Duration) {
	t.Helper()
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("condition not met before the deadline")
}

// TestPublishMetricsSuccess proves a successful gateway publish increments the
// attempt and success counters (OW-F04).
func TestPublishMetricsSuccess(t *testing.T) {
	beforeAttempts := publishAttempts.Value()
	beforeSuccess := publishSuccess.Value()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	New(srv.URL, "secret", slog.Default()).Publish([]string{"club:x"}, "raid:resolved", map[string]any{"raidId": "r1"})

	waitFor(t, func() bool { return publishSuccess.Value() >= beforeSuccess+1 }, 3*time.Second)
	if got := publishAttempts.Value(); got < beforeAttempts+1 {
		t.Fatalf("attempts = %v, want >= %v", got, beforeAttempts+1)
	}
}

// TestPublishMetricsFailure proves a non-2xx gateway reply increments the
// failure counter.
func TestPublishMetricsFailure(t *testing.T) {
	beforeFailure := publishFailure.Value()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	New(srv.URL, "secret", slog.Default()).Publish([]string{"club:x"}, "raid:resolved", map[string]any{"raidId": "r1"})

	waitFor(t, func() bool { return publishFailure.Value() >= beforeFailure+1 }, 3*time.Second)
}

// TestPublishMetricsDropped proves an invalid event (no topic/event) is counted
// as a drop rather than an attempt.
func TestPublishMetricsDropped(t *testing.T) {
	beforeDropped := publishDropped.Value()
	beforeAttempts := publishAttempts.Value()

	// Enabled client, but the empty event fails buildBody before any POST.
	New("http://127.0.0.1:1", "secret", slog.Default()).Publish([]string{"club:x"}, "", nil)

	if got := publishDropped.Value(); got != beforeDropped+1 {
		t.Fatalf("dropped = %v, want %v", got, beforeDropped+1)
	}
	if got := publishAttempts.Value(); got != beforeAttempts {
		t.Fatalf("attempts = %v, want unchanged %v (a drop is not an attempt)", got, beforeAttempts)
	}
}
