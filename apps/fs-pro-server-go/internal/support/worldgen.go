package support

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
)

const (
	defaultWorldgenURL = "http://localhost:3004"
	worldgenTimeout    = 5 * time.Second
)

// worldgenClient is a thin HTTP client for services/worldgen (names/faces),
// mirroring apps/fs-pro-server/src/services/worldgen/client.ts.
type worldgenClient struct {
	base string
	hc   *http.Client
}

func newWorldgenClient(raw string) worldgenClient {
	base := strings.TrimSpace(raw)
	if base == "" {
		base = defaultWorldgenURL
	}
	return worldgenClient{base: strings.TrimRight(base, "/"), hc: &http.Client{Timeout: worldgenTimeout}}
}

// face fetches a deterministic face SVG for an identity, returning the SVG and
// the service's Cache-Control header (both may be empty on error).
func (c worldgenClient) face(ctx context.Context, identity, version string) (string, string, error) {
	u := c.base + "/faces/generate?identity=" + url.QueryEscape(identity) + "&version=" + url.QueryEscape(version)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", "", err
	}
	resp, err := c.hc.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("worldgen /faces/generate -> %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", "", err
	}
	return string(body), resp.Header.Get("Cache-Control"), nil
}

// postJSON posts a body and decodes a JSON object response.
func (c worldgenClient) postJSON(ctx context.Context, path string, body any, out any) error {
	text, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+path, bytes.NewReader(text))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("worldgen %s -> %d", path, resp.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(out)
}

// names mirrors generateNames (POST /names/generate) and returns the name list.
func (c worldgenClient) names(ctx context.Context, count int, culture, returnParts string) ([]string, error) {
	body := map[string]any{"count": count, "culture": culture}
	if returnParts != "" {
		body["returnParts"] = returnParts
	}
	var out struct {
		Names []string `json:"names"`
	}
	if err := c.postJSON(ctx, "/names/generate", body, &out); err != nil {
		return nil, err
	}
	return out.Names, nil
}

// familyNames mirrors generateFamilyNames (POST /names/family).
func (c worldgenClient) familyNames(ctx context.Context, count int, culture, lastname string) ([]string, error) {
	var out struct {
		Names []string `json:"names"`
	}
	if err := c.postJSON(ctx, "/names/family", map[string]any{"count": count, "culture": culture, "lastname": lastname}, &out); err != nil {
		return nil, err
	}
	return out.Names, nil
}

// healthy reports whether worldgen answers its /health endpoint.
func (c worldgenClient) healthy(ctx context.Context) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/health", nil)
	if err != nil {
		return false
	}
	resp, err := c.hc.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	return resp.StatusCode == http.StatusOK
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// playerFace is GET /api/players/{id}/face.
func (h *Handlers) playerFace(w http.ResponseWriter, r *http.Request) {
	h.entityFace(w, r, "Players", "Player not found", "Error generating player face")
}

// managerFace is GET /api/managers/{id}/face.
func (h *Handlers) managerFace(w http.ResponseWriter, r *http.Request) {
	h.entityFace(w, r, "Managers", "Manager not found", "Error generating manager face")
}

func (h *Handlers) entityFace(w http.ResponseWriter, r *http.Request, table, notFound, badGateway string) {
	id := r.PathValue("id")
	rows, err := h.q.Query(r.Context(), `SELECT 1 AS ok FROM "`+table+`" WHERE "_id" = $1`, id)
	if err != nil {
		h.serverError(w, "check entity", err)
		return
	}
	if _, ok, err := db.ScanOne(rows); err != nil {
		h.serverError(w, "check entity", err)
		return
	} else if !ok {
		httpapi.WriteJSON(w, http.StatusNotFound, fail(notFound))
		return
	}
	svg, cache, err := h.wg.face(r.Context(), id, "v3")
	if err != nil {
		h.log.Warn("face generation failed", "table", table, "id", id, "err", err)
		httpapi.WriteJSON(w, http.StatusBadGateway, fail(badGateway))
		return
	}
	writeSVG(w, svg, cache)
}

// worldgenFace is GET /api/services/worldgen/faces.
func (h *Handlers) worldgenFace(w http.ResponseWriter, r *http.Request) {
	identity := r.URL.Query().Get("identity")
	if identity == "" {
		httpapi.WriteJSON(w, http.StatusBadRequest, fail("identity query parameter is required"))
		return
	}
	svg, cache, err := h.wg.face(r.Context(), identity, r.URL.Query().Get("version"))
	if err != nil {
		h.log.Warn("worldgen face failed", "identity", identity, "err", err)
		httpapi.WriteJSON(w, http.StatusBadGateway, fail("Error generating face"))
		return
	}
	writeSVG(w, svg, cache)
}

// worldgenNames is POST /api/services/worldgen/names.
func (h *Handlers) worldgenNames(w http.ResponseWriter, r *http.Request) {
	body, _ := httpapi.Get(r).BodyMap()
	count, okCount := integerField(body, "count")
	culture, _ := body["culture"].(string)
	if !okCount || culture == "" {
		httpapi.WriteJSON(w, http.StatusBadRequest, fail("count (integer) and culture are required"))
		return
	}
	returnParts, _ := body["returnParts"].(string)
	names, err := h.wg.names(r.Context(), count, culture, returnParts)
	if err != nil {
		h.log.Warn("worldgen names failed", "culture", culture, "err", err)
		httpapi.WriteJSON(w, http.StatusBadGateway, fail("Error generating names"))
		return
	}
	httpapi.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "names": names})
}

// worldgenFamilyNames is POST /api/services/worldgen/names/family.
func (h *Handlers) worldgenFamilyNames(w http.ResponseWriter, r *http.Request) {
	body, _ := httpapi.Get(r).BodyMap()
	count, okCount := integerField(body, "count")
	culture, _ := body["culture"].(string)
	lastname, _ := body["lastname"].(string)
	if !okCount || culture == "" || lastname == "" {
		httpapi.WriteJSON(w, http.StatusBadRequest, fail("count (integer), culture and lastname are required"))
		return
	}
	names, err := h.wg.familyNames(r.Context(), count, culture, lastname)
	if err != nil {
		h.log.Warn("worldgen family names failed", "culture", culture, "err", err)
		httpapi.WriteJSON(w, http.StatusBadGateway, fail("Error generating family names"))
		return
	}
	httpapi.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "names": names})
}

// worldgenHealth is GET /api/services/worldgen/health.
func (h *Handlers) worldgenHealth(w http.ResponseWriter, r *http.Request) {
	healthy := h.wg.healthy(r.Context())
	status := http.StatusOK
	if !healthy {
		status = http.StatusServiceUnavailable
	}
	httpapi.WriteJSON(w, status, map[string]any{
		"success":  healthy,
		"services": map[string]any{"worldgen": healthy},
	})
}

// writeSVG writes an SVG document with the optional upstream Cache-Control.
func writeSVG(w http.ResponseWriter, svg, cacheControl string) {
	if cacheControl != "" {
		w.Header().Set("Cache-Control", cacheControl)
	}
	w.Header().Set("Content-Type", "image/svg+xml")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(svg))
}

// integerField reports an integer-valued JSON number (Node Number.isInteger).
func integerField(m map[string]any, key string) (int, bool) {
	n, ok := numberField(m, key)
	if !ok || n != float64(int(n)) {
		return 0, false
	}
	return int(n), true
}
