// Command realtime is fs-pro's multiplayer gateway: the one place browsers
// hold a live connection. It carries world events (published by the Node API
// over signed HTTP), private club notifications, presence (who is online,
// who is looking at a club's grounds) and chat. It keeps no game state: the
// Node API and Postgres stay the source of truth, and a client that misses
// an event just refetches.
//
//	GET  /ws?ticket=...   WebSocket; the ticket comes from GET /api/realtime/ticket
//	POST /publish         {topic | topics, event, data}, X-Signature: hex HMAC-SHA256(body)
//	GET  /presence?topic= members of a topic (signed like /publish, via query sig)
//	GET  /healthz, /stats
package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/coder/websocket"
)

const devSecret = "fs-pro-dev-realtime-secret"

type config struct {
	addr    string
	secret  []byte
	origins []string
}

func loadConfig() config {
	port := os.Getenv("REALTIME_PORT")
	if port == "" {
		port = "3005"
	}
	secret := os.Getenv("REALTIME_SECRET")
	if secret == "" {
		log.Printf("REALTIME_SECRET is not set - using the insecure development secret")
		secret = devSecret
	}
	origins := []string{"localhost:*", "127.0.0.1:*"}
	if o := os.Getenv("REALTIME_ORIGINS"); o != "" {
		origins = strings.Split(o, ",")
	}
	return config{addr: ":" + port, secret: []byte(secret), origins: origins}
}

type publishBody struct {
	Topic  string          `json:"topic"`
	Topics []string        `json:"topics"`
	Event  string          `json:"event"`
	Data   json.RawMessage `json:"data"`
}

func newServer(cfg config, hub *Hub) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /ws", func(w http.ResponseWriter, r *http.Request) {
		claims, err := VerifyTicket(cfg.secret, r.URL.Query().Get("ticket"), time.Now())
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}
		ws, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: cfg.origins})
		if err != nil {
			return
		}
		newConn(hub, ws, claims).Run(r.Context())
	})

	mux.HandleFunc("POST /publish", func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 64<<10))
		if err != nil || !VerifyBody(cfg.secret, body, r.Header.Get("X-Signature")) {
			http.Error(w, "bad signature", http.StatusUnauthorized)
			return
		}
		var p publishBody
		if json.Unmarshal(body, &p) != nil || p.Event == "" {
			http.Error(w, "bad body", http.StatusBadRequest)
			return
		}
		topics := p.Topics
		if p.Topic != "" {
			topics = append(topics, p.Topic)
		}
		if len(p.Data) == 0 {
			p.Data = json.RawMessage("null")
		}
		delivered := 0
		for _, t := range topics {
			delivered += hub.Publish(t, p.Event, p.Data)
		}
		writeJSON(w, map[string]any{"delivered": delivered})
	})

	mux.HandleFunc("GET /presence", func(w http.ResponseWriter, r *http.Request) {
		topic := r.URL.Query().Get("topic")
		if !VerifyBody(cfg.secret, []byte(topic), r.URL.Query().Get("sig")) {
			http.Error(w, "bad signature", http.StatusUnauthorized)
			return
		}
		writeJSON(w, map[string]any{"topic": topic, "members": hub.Members(topic)})
	})

	// Moderator tools, signed like /publish (X-Signature: HMAC of the body).
	// The Node API calls these for admins; they can also be used with curl.
	admin := func(path string, handle func(body []byte) (any, int)) {
		mux.HandleFunc("POST "+path, func(w http.ResponseWriter, r *http.Request) {
			body, err := io.ReadAll(io.LimitReader(r.Body, 8<<10))
			if err != nil || !VerifyBody(cfg.secret, body, r.Header.Get("X-Signature")) {
				http.Error(w, "bad signature", http.StatusUnauthorized)
				return
			}
			out, status := handle(body)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(status)
			_ = json.NewEncoder(w).Encode(out)
		})
	}
	admin("/admin/mute", func(body []byte) (any, int) {
		var p struct {
			UserID  string `json:"uid"`
			Minutes int    `json:"minutes"`
			Purge   bool   `json:"purge"`
		}
		if json.Unmarshal(body, &p) != nil || p.UserID == "" || p.Minutes <= 0 || p.Minutes > 60*24*30 {
			return map[string]any{"error": "need uid and minutes (1 to 43200)"}, http.StatusBadRequest
		}
		until := hub.AdminMute(p.UserID, time.Duration(p.Minutes)*time.Minute, p.Purge)
		return map[string]any{"uid": p.UserID, "until": until.UnixMilli()}, http.StatusOK
	})
	admin("/admin/unmute", func(body []byte) (any, int) {
		var p struct {
			UserID string `json:"uid"`
		}
		if json.Unmarshal(body, &p) != nil || p.UserID == "" {
			return map[string]any{"error": "need uid"}, http.StatusBadRequest
		}
		hub.mod.Unmute(p.UserID)
		return map[string]any{"uid": p.UserID}, http.StatusOK
	})
	admin("/admin/reports", func([]byte) (any, int) {
		return map[string]any{"reports": hub.mod.Reports(), "muted": hub.mod.Muted()}, http.StatusOK
	})

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"ok": true})
	})
	mux.HandleFunc("GET /stats", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, hub.Stats())
	})
	return mux
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func main() {
	cfg := loadConfig()
	hub := NewHub()
	hub.mod = newModerator(loadModConfig())
	go func() {
		for range time.Tick(time.Minute) {
			hub.mod.Sweep()
		}
	}()
	go hub.RunOnline(make(chan struct{}))
	log.Printf("fs-pro realtime gateway on %s", cfg.addr)
	srv := &http.Server{Addr: cfg.addr, Handler: newServer(cfg, hub), ReadHeaderTimeout: 10 * time.Second}
	log.Fatal(srv.ListenAndServe())
}
