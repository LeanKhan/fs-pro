// Package tile proxies GET /api/tiles/{z}/{x}/{y} to the Go world-service.
package tile

import (
	"io"
	"net/http"
	"strings"
	"time"

	"fs-pro-server/internal/httpapi"
)

// Handlers proxies tile requests.
type Handlers struct {
	base   string
	client *http.Client
}

// New builds the handler set. base defaults to WORLD_SERVICE_URL or loopback.
func New(base string) *Handlers {
	if base == "" {
		base = "http://127.0.0.1:3016"
	}
	return &Handlers{base: strings.TrimRight(base, "/"), client: &http.Client{Timeout: 5 * time.Second}}
}

// getTile is GET /api/tiles/{z}/{x}/{y}.
func (h *Handlers) getTile(w http.ResponseWriter, r *http.Request) {
	target := h.base + "/tiles/" + r.PathValue("z") + "/" + r.PathValue("x") + "/" + r.PathValue("y")
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target, nil)
	if err != nil {
		httpapi.WriteJSON(w, 400, map[string]any{"success": false, "message": "Invalid tile request"})
		return
	}
	resp, err := h.client.Do(req)
	if err != nil {
		httpapi.WriteJSON(w, 400, map[string]any{
			"success": false,
			"message": "fetch failed",
		})
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	ct := resp.Header.Get("Content-Type")
	if ct == "" {
		ct = "application/json; charset=utf-8"
	}
	w.Header().Set("Content-Type", ct)
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(body)
}
