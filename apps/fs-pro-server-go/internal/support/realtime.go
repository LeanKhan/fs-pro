package support

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
)

const (
	devRealtimeSecret = "fs-pro-dev-realtime-secret"
	ticketSeconds     = 10 * 60
	relayTimeout      = 5 * time.Second
)

// realtimeConfig mirrors apps/fs-pro-server/src/realtime/world-events.ts.
type realtimeConfig struct {
	secret    string
	url       string
	publicURL string
	enabled   bool
}

func realtimeFromEnv(url, secret, publicURL string) realtimeConfig {
	s := strings.TrimSpace(secret)
	if s == "" {
		s = devRealtimeSecret
	}
	u := strings.TrimSpace(url)
	enabled := u != "off"
	if u == "" || u == "off" {
		u = "http://localhost:3005"
	}
	u = strings.TrimRight(u, "/")
	pub := strings.TrimSpace(publicURL)
	if pub == "" {
		pub = u
	}
	pub = strings.TrimRight(strings.Replace(pub, "http", "ws", 1), "/")
	return realtimeConfig{secret: s, url: u, publicURL: pub, enabled: enabled}
}

// ticketClaims is byte-compatible with apps/fs-pro-realtime Claims (ticket.go).
type ticketClaims struct {
	UID          string   `json:"uid"`
	Name         string   `json:"name"`
	Clubs        []string `json:"clubs"`
	Associations []string `json:"assocs,omitempty"`
	Code         string   `json:"code,omitempty"`
	Admin        bool     `json:"admin,omitempty"`
	Verified     bool     `json:"ver,omitempty"`
	Expires      int64    `json:"exp"`
}

// signTicket issues "<base64url(payload)>.<base64url(hmac-sha256(payload))>",
// the exact ticket format the gateway verifies (apps/fs-pro-realtime/ticket.go).
func signTicket(secret string, c ticketClaims) (string, error) {
	payload, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	enc := base64.RawURLEncoding
	return enc.EncodeToString(payload) + "." + enc.EncodeToString(mac.Sum(nil)), nil
}

// realtimeTicket is GET /api/realtime/ticket.
func (h *Handlers) realtimeTicket(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := sessionUser(httpapi.Get(r))
	if uid == "" {
		httpapi.WriteJSON(w, http.StatusUnauthorized, fail("Not logged in"))
		return
	}
	user, ok, err := h.loadUser(ctx, uid)
	if err != nil {
		h.serverError(w, "read account", err)
		return
	}
	if !ok {
		httpapi.WriteJSON(w, http.StatusUnauthorized, fail("Not logged in"))
		return
	}
	clubs, err := h.ownedClubs(ctx, uid)
	if err != nil {
		h.serverError(w, "read clubs", err)
		return
	}
	ids := make([]string, 0, len(clubs))
	for _, c := range clubs {
		if id := db.StringField(c, "_id"); id != "" {
			ids = append(ids, id)
		}
	}
	assocs, err := h.associations(ctx, ids)
	if err != nil {
		h.serverError(w, "read associations", err)
		return
	}
	if !h.rt.enabled {
		httpapi.WriteJSON(w, http.StatusServiceUnavailable, fail("Realtime is off"))
		return
	}

	admin := boolField(user, "isAdmin")
	claims := ticketClaims{
		UID:     uid,
		Name:    firstNonEmpty(db.StringField(user, "FullName"), db.StringField(user, "Username")),
		Clubs:   ids,
		Admin:   admin,
		Expires: time.Now().Add(ticketSeconds * time.Second).Unix(),
	}
	if len(assocs) > 0 {
		claims.Associations = assocs
	}
	if len(clubs) > 0 {
		claims.Code = db.StringField(clubs[0], "ClubCode")
	}
	if !h.requireVerified || admin ||
		db.StringField(user, "accountId") != "" || db.StringField(user, "EmailVerifiedAt") != "" {
		claims.Verified = true
	}

	ticket, err := signTicket(h.rt.secret, claims)
	if err != nil {
		h.serverError(w, "sign ticket", err)
		return
	}
	httpapi.WriteJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": "Ticket",
		"payload": map[string]any{"url": h.rt.publicURL + "/ws", "ticket": ticket},
	})
}

// realtimeReports is GET /api/realtime/mod/reports.
func (h *Handlers) realtimeReports(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	h.relay(w, r.Context(), "/admin/reports", map[string]any{})
}

// realtimeMute is POST /api/realtime/mod/mute.
func (h *Handlers) realtimeMute(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	body, _ := httpapi.Get(r).BodyMap()
	uid, _ := body["uid"].(string)
	minutes, ok := numberField(body, "minutes")
	if uid == "" || !ok {
		httpapi.WriteJSON(w, http.StatusBadRequest, fail("Send uid and minutes"))
		return
	}
	purge, _ := body["purge"].(bool)
	h.relay(w, r.Context(), "/admin/mute", map[string]any{"uid": uid, "minutes": minutes, "purge": purge})
}

// realtimeUnmute is POST /api/realtime/mod/unmute.
func (h *Handlers) realtimeUnmute(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	body, _ := httpapi.Get(r).BodyMap()
	uid, _ := body["uid"].(string)
	if uid == "" {
		httpapi.WriteJSON(w, http.StatusBadRequest, fail("Send uid"))
		return
	}
	h.relay(w, r.Context(), "/admin/unmute", map[string]any{"uid": uid})
}

// requireAdmin enforces the session + isAdmin gate, writing the Node body on
// refusal and returning false.
func (h *Handlers) requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	uid := sessionUser(httpapi.Get(r))
	if uid == "" {
		httpapi.WriteJSON(w, http.StatusUnauthorized, fail("Not logged in"))
		return false
	}
	user, ok, err := h.loadUser(r.Context(), uid)
	if err != nil {
		h.serverError(w, "read account", err)
		return false
	}
	if !ok || !boolField(user, "isAdmin") {
		httpapi.WriteJSON(w, http.StatusForbidden, fail("Admins only"))
		return false
	}
	return true
}

// relay signs and forwards a moderation request to the gateway (the Node
// `gatewayAdmin` helper) and passes its status/body back.
func (h *Handlers) relay(w http.ResponseWriter, ctx context.Context, path string, body any) {
	if !h.rt.enabled {
		httpapi.WriteJSON(w, http.StatusServiceUnavailable, fail("Realtime is off"))
		return
	}
	text, err := json.Marshal(body)
	if err != nil {
		h.serverError(w, "encode moderation", err)
		return
	}
	mac := hmac.New(sha256.New, []byte(h.rt.secret))
	mac.Write(text)
	reqCtx, cancel := context.WithTimeout(ctx, relayTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, h.rt.url+path, bytes.NewReader(text))
	if err != nil {
		h.serverError(w, "build moderation request", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Signature", hex.EncodeToString(mac.Sum(nil)))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		httpapi.WriteJSON(w, http.StatusBadGateway, fail("The chat gateway is not reachable"))
		return
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var payload any
	_ = json.Unmarshal(raw, &payload)
	message := "Done"
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		message = "The chat gateway refused the request"
		if m, ok := payload.(map[string]any); ok {
			if s, ok := m["error"].(string); ok && s != "" {
				message = s
			}
		}
	}
	httpapi.WriteJSON(w, resp.StatusCode, map[string]any{
		"success": resp.StatusCode >= 200 && resp.StatusCode < 300,
		"message": message,
		"payload": payload,
	})
}

// loadUser reads the ticket-relevant account fields.
func (h *Handlers) loadUser(ctx context.Context, uid string) (map[string]any, bool, error) {
	rows, err := h.q.Query(ctx,
		`SELECT "_id","FullName","Username","isAdmin","accountId","EmailVerifiedAt" FROM "Users" WHERE "_id" = $1`, uid)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

// ownedClubs reads the clubs the user owns, in the DB's natural order (the Node
// ticket uses owned[0] as the display code).
func (h *Handlers) ownedClubs(ctx context.Context, uid string) ([]map[string]any, error) {
	rows, err := h.q.Query(ctx, `SELECT "_id","ClubCode" FROM "Clubs" WHERE "UserId" = $1`, uid)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

// associations reads the distinct associations the user's clubs belong to, so
// the gateway can scope the association rooms (fail-closed without it).
func (h *Handlers) associations(ctx context.Context, clubIDs []string) ([]string, error) {
	if len(clubIDs) == 0 {
		return nil, nil
	}
	args := make([]any, 0, len(clubIDs))
	placeholders := make([]string, 0, len(clubIDs))
	for i, id := range clubIDs {
		placeholders = append(placeholders, fmt.Sprintf("$%d", i+1))
		args = append(args, id)
	}
	rows, err := h.q.Query(ctx, `SELECT DISTINCT "AssociationId" FROM "AssociationMembers"
		WHERE "ClubId" IN (`+strings.Join(placeholders, ",")+`)`, args...)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(list))
	for _, row := range list {
		id := strings.TrimSpace(db.StringField(row, "AssociationId"))
		if id != "" && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	sort.Strings(out)
	return out, nil
}

func (h *Handlers) serverError(w http.ResponseWriter, what string, err error) {
	h.log.Error("support handler failed", "what", what, "err", err)
	httpapi.WriteJSON(w, http.StatusBadGateway, fail("Something went wrong, please try again"))
}

func boolField(m map[string]any, key string) bool {
	b, _ := m[key].(bool)
	return b
}

func numberField(m map[string]any, key string) (float64, bool) {
	switch n := m[key].(type) {
	case float64:
		return n, true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	default:
		return 0, false
	}
}
