package realtime

import (
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
)

// independentSign reproduces the gateway's VerifyBody algorithm
// (apps/fs-pro-realtime/ticket.go sign/VerifyBody) without calling our own Sign,
// so a bug in Sign cannot make the parity tests pass.
func independentSign(secret, body []byte) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// TestSignGoldenVector pins Sign to a value computed by the Node signer
// (crypto.createHmac('sha256', secret).update(body).digest('hex')) — with the
// exact body bytes written to a file so no shell quoting can alter them:
//
//	node -e "const c=require('crypto'),fs=require('fs');console.log(
//	  c.createHmac('sha256','fs-pro-test-secret').update(fs.readFileSync('body.json')).digest('hex'))"
//	# body.json = {"topics":["club:def-1"],"event":"raid:resolved","data":{"raidId":"r1","stars":3}}
//	# 5edbcecaae3a4527229d1bed7fbc86d19ae7328002f4a5ef812b2268364d21f5
//
// This is the exact cross-language proof that the Go signature matches
// hex(hmac-sha256(secret, body)) the gateway and the Node signer both use.
func TestSignGoldenVector(t *testing.T) {
	const (
		secret = "fs-pro-test-secret"
		body   = `{"topics":["club:def-1"],"event":"raid:resolved","data":{"raidId":"r1","stars":3}}`
		want   = "5edbcecaae3a4527229d1bed7fbc86d19ae7328002f4a5ef812b2268364d21f5"
	)
	if got := Sign(secret, []byte(body)); got != want {
		t.Fatalf("Sign = %s, want the Node golden %s", got, want)
	}
	// And Sign agrees with an independent HMAC-SHA256 over the same bytes.
	if got := Sign(secret, []byte(body)); got != independentSign([]byte(secret), []byte(body)) {
		t.Fatalf("Sign disagrees with hmac-sha256: %s", got)
	}
}

// TestBuildBodyMatchesNodeShape pins the byte-for-byte body the Node signer
// sends: JSON.stringify({topics,event,data}) with no whitespace and that key
// order. The signature is over these bytes, so the shape is part of the
// contract, not cosmetic.
func TestBuildBodyMatchesNodeShape(t *testing.T) {
	got, err := buildBody([]string{"club:def-1"}, "raid:resolved", map[string]any{"raidId": "r1", "stars": 3})
	if err != nil {
		t.Fatalf("buildBody: %v", err)
	}
	want := `{"topics":["club:def-1"],"event":"raid:resolved","data":{"raidId":"r1","stars":3}}`
	if string(got) != want {
		t.Fatalf("body = %s\nwant   %s", got, want)
	}
}

func TestBuildBodyValidates(t *testing.T) {
	if _, err := buildBody(nil, "raid:resolved", nil); err == nil {
		t.Fatal("empty topics must be rejected")
	}
	if _, err := buildBody([]string{"club:x"}, "", nil); err == nil {
		t.Fatal("empty event must be rejected")
	}
}

func TestDisabledClientNoOps(t *testing.T) {
	// A server that fails the test if it is ever called.
	hit := make(chan struct{}, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		hit <- struct{}{}
	}))
	defer srv.Close()

	for _, tc := range []struct{ name, url, secret string }{
		{"no url", "", "s"},
		{"no secret", srv.URL, ""},
		{"off", "off", "s"},
	} {
		c := New(tc.url, tc.secret, slog.Default())
		if c.Enabled() {
			t.Fatalf("%s: client must be disabled", tc.name)
		}
		c.Publish([]string{"club:x"}, "raid:resolved", map[string]any{"raidId": "r1"})
	}
	select {
	case <-hit:
		t.Fatal("a disabled client posted to the gateway")
	case <-time.After(100 * time.Millisecond):
	}
}

// TestPublishSignsAndPosts is the wire contract: the client POSTs
// {topics,event,data} to /publish with an X-Signature the gateway's own
// algorithm accepts, and the topic/event/data survive the round trip.
func TestPublishSignsAndPosts(t *testing.T) {
	const secret = "shared-realtime-secret"
	type received struct {
		body []byte
		sig  string
	}
	got := make(chan received, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/publish" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		got <- received{body: body, sig: r.Header.Get("X-Signature")}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"delivered":1}`))
	}))
	defer srv.Close()

	c := New(srv.URL+"/", secret, slog.Default())
	if !c.Enabled() {
		t.Fatal("client must be enabled with url+secret")
	}
	payload := map[string]any{
		"raidId": "r1", "practice": false, "stars": 3,
		"score": map[string]any{"you": 0, "them": 3},
	}
	c.Publish([]string{"club:def-1"}, "raid:resolved", payload)

	var r received
	select {
	case r = <-got:
	case <-time.After(3 * time.Second):
		t.Fatal("the gateway was never called")
	}
	// The header is the gateway's hex HMAC-SHA256 of the exact body bytes.
	if want := independentSign([]byte(secret), r.body); r.sig != want {
		t.Fatalf("X-Signature = %s, want %s (body %s)", r.sig, want, r.body)
	}
	var env struct {
		Topics []string        `json:"topics"`
		Event  string          `json:"event"`
		Data   json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(r.body, &env); err != nil {
		t.Fatalf("bad body %s: %v", r.body, err)
	}
	if len(env.Topics) != 1 || env.Topics[0] != "club:def-1" {
		t.Fatalf("topics = %v, want [club:def-1]", env.Topics)
	}
	if env.Event != "raid:resolved" {
		t.Fatalf("event = %q", env.Event)
	}
	var data map[string]any
	if err := json.Unmarshal(env.Data, &data); err != nil {
		t.Fatalf("data: %v", err)
	}
	if data["raidId"] != "r1" || data["stars"].(float64) != 3 {
		t.Fatalf("data not preserved: %v", data)
	}
}

// TestPublishNeverBlocks proves the hot path returns promptly even when the
// gateway hangs: Publish hands the POST to the background, so a game write on
// the same goroutine is never stalled.
func TestPublishNeverBlocks(t *testing.T) {
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-release // hang until the test lets go
	}))
	defer srv.Close()
	defer close(release)

	c := New(srv.URL, "s", slog.Default())
	start := time.Now()
	c.Publish([]string{"club:x"}, "raid:resolved", map[string]any{"raidId": "r1"})
	if elapsed := time.Since(start); elapsed > 250*time.Millisecond {
		t.Fatalf("Publish blocked for %s", elapsed)
	}
}
