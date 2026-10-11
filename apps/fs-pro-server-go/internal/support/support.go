// Package support registers the non-contract HTTP surfaces the client uses that
// the Node server owns today (docs/go-server-rewrite/04 §2): the realtime ticket
// + moderation relay, generated player/manager faces, and the worldgen service
// proxies. They are deliberately outside @repo/api-contract (SVG / binary /
// multipart), so they register with RegisterRaw and carry their own auth, like
// the Node routes they replace. Their manifest ids use the "support." prefix,
// which contract-check ignores (see contract-check/check-contract.mjs).
package support

import (
	"log/slog"
	"net/http"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
)

// Deps are the support surface's collaborators.
type Deps struct {
	// Q is the database querier (the pool). Required for the ticket and the
	// face existence checks.
	Q      db.Querier
	Logger *slog.Logger

	// RealtimeURL / RealtimeSecret / RealtimePublicURL configure the signed
	// ticket and the moderation relay to apps/fs-pro-realtime. RealtimeURL
	// "off" disables both (the ticket answers 503, matching Node).
	RealtimeURL       string
	RealtimeSecret    string
	RealtimePublicURL string

	// WorldgenURL is the base URL of services/worldgen (names/faces).
	WorldgenURL string

	// RequireVerifiedEmail mirrors REQUIRE_VERIFIED_EMAIL: when true, only a
	// verified/admin/SSO account gets the ticket's `ver` chat claim.
	RequireVerifiedEmail bool
}

// Handlers implements the support routes.
type Handlers struct {
	q               db.Querier
	log             *slog.Logger
	rt              realtimeConfig
	wg              worldgenClient
	requireVerified bool
}

// New builds the handler set.
func New(d Deps) *Handlers {
	log := d.Logger
	if log == nil {
		log = slog.Default()
	}
	return &Handlers{
		q:               d.Q,
		log:             log,
		rt:              realtimeFromEnv(d.RealtimeURL, d.RealtimeSecret, d.RealtimePublicURL),
		wg:              newWorldgenClient(d.WorldgenURL),
		requireVerified: d.RequireVerifiedEmail,
	}
}

// Register wires the support routes (Node: controllers/realtime,
// controllers/{players,managers}/*face, controllers/services, controllers/world
// crest+kit routers).
func Register(srv *httpapi.Server, h *Handlers) {
	// Realtime ticket + admin moderation relay.
	srv.RegisterRaw("support.getRealtimeTicket", http.MethodGet, "/api/realtime/ticket",
		[]int{200, 401, 502, 503}, h.realtimeTicket)
	srv.RegisterRaw("support.realtimeReports", http.MethodGet, "/api/realtime/mod/reports",
		[]int{200, 401, 403, 502, 503}, h.realtimeReports)
	srv.RegisterRaw("support.realtimeMute", http.MethodPost, "/api/realtime/mod/mute",
		[]int{200, 400, 401, 403, 502, 503}, h.realtimeMute)
	srv.RegisterRaw("support.realtimeUnmute", http.MethodPost, "/api/realtime/mod/unmute",
		[]int{200, 400, 401, 403, 502, 503}, h.realtimeUnmute)

	// Generated faces (player/manager) and the worldgen service surface.
	srv.RegisterRaw("support.getPlayerFace", http.MethodGet, "/api/players/{id}/face",
		[]int{200, 404, 502}, h.playerFace)
	srv.RegisterRaw("support.getManagerFace", http.MethodGet, "/api/managers/{id}/face",
		[]int{200, 404, 502}, h.managerFace)
	srv.RegisterRaw("support.worldgenFaces", http.MethodGet, "/api/services/worldgen/faces",
		[]int{200, 400, 502}, h.worldgenFace)
	srv.RegisterRaw("support.worldgenNames", http.MethodPost, "/api/services/worldgen/names",
		[]int{200, 400, 502}, h.worldgenNames)
	srv.RegisterRaw("support.worldgenFamilyNames", http.MethodPost, "/api/services/worldgen/names/family",
		[]int{200, 400, 502}, h.worldgenFamilyNames)
	srv.RegisterRaw("support.worldgenHealth", http.MethodGet, "/api/services/worldgen/health",
		[]int{200, 503}, h.worldgenHealth)

	// Club crests/kits and the static /img mount (Node: atlas.router.ts, express.static).
	registerCrests(srv, h)
}

// sessionUser reads the signed-in user id from the request context.
func sessionUser(cx *httpapi.Context) string {
	if cx != nil && cx.Session != nil {
		return cx.Session.UserID()
	}
	return ""
}

// fail builds the `{success:false,message}` body the Node routes emit.
func fail(message string) map[string]any {
	return map[string]any{"success": false, "message": message}
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
