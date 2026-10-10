package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// TestGoClientSignatureAndDelivery pins the cross-module /publish contract
// against the Go client (apps/fs-pro-server-go/internal/realtime):
//
//   - the exact body Go's buildBody emits and the hex signature Go's Sign
//     produces for it (a fixed vector, also asserted by the Go golden test);
//   - the gateway's VerifyBody accepts it, and rejects a tampered one;
//   - POSTing those exact bytes delivers an event to a subscriber on the
//     defender's private club topic.
//
// The literals are intentional: a change to either side's signing breaks this.
func TestGoClientSignatureAndDelivery(t *testing.T) {
	const (
		secret = "fs-pro-test-secret"
		body   = `{"topics":["club:def-1"],"event":"raid:resolved","data":{"raidId":"r1","stars":3}}`
		sig    = "5edbcecaae3a4527229d1bed7fbc86d19ae7328002f4a5ef812b2268364d21f5"
	)

	if !VerifyBody([]byte(secret), []byte(body), sig) {
		t.Fatal("the gateway rejected the Go client's golden signature")
	}
	tampered := sig[:len(sig)-1] + "0"
	if VerifyBody([]byte(secret), []byte(body), tampered) {
		t.Fatal("a tampered signature must be rejected")
	}

	hub := NewHub()
	srv := httptest.NewServer(newServer(config{secret: []byte(secret), origins: []string{"*"}}, hub))
	defer srv.Close()

	defender := newTestConn("def-1-owner", "def-1")
	hub.Add(defender)
	if !hub.Subscribe(defender, ClubTopic("def-1")) {
		t.Fatal("the defender could not join their club topic")
	}

	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/publish", bytes.NewBufferString(body))
	req.Header.Set("X-Signature", sig)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("publish status = %d, want 200", res.StatusCode)
	}

	select {
	case raw := <-defender.out:
		var m map[string]any
		if err := json.Unmarshal(raw, &m); err != nil {
			t.Fatalf("bad frame: %v (%s)", err, raw)
		}
		if m["type"] != "event" || m["topic"] != "club:def-1" || m["event"] != "raid:resolved" {
			t.Fatalf("unexpected frame: %v", m)
		}
		data := m["data"].(map[string]any)
		if data["raidId"] != "r1" || data["stars"].(float64) != 3 {
			t.Fatalf("payload not preserved: %v", data)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("the defender received no raid:resolved frame")
	}
}
