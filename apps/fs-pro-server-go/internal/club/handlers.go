package club

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
	"fs-pro-server/internal/player"

	"github.com/jackc/pgx/v5"
)

// ManagerStore is the slice of the Manager repository the hire/fire flow needs.
// Implemented by manager.Repository; declared here so club does not import
// manager (which itself imports club).
type ManagerStore interface {
	ManagerByID(ctx context.Context, id string) (map[string]any, bool, error)
	AppendManagerRecord(ctx context.Context, id string, fields map[string]any, record any) (map[string]any, error)
}

// Handlers implements the clubs.* routes.
type Handlers struct {
	repo     *Repository
	players  *player.Repository
	managers ManagerStore
	logger   *slog.Logger

	mu  sync.Mutex
	rng *rand.Rand
}

// New builds the handler set.
func New(repo *Repository, players *player.Repository, managers ManagerStore, logger *slog.Logger) *Handlers {
	if logger == nil {
		logger = slog.Default()
	}
	return &Handlers{repo: repo, players: players, managers: managers, logger: logger,
		rng: rand.New(rand.NewSource(time.Now().UnixNano()))}
}

func (h *Handlers) rand() *rand.Rand {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.rng
}

func body(cx *httpapi.Context) map[string]any {
	m, _ := cx.BodyMap()
	if m == nil {
		return map[string]any{}
	}
	return m
}

func str(m map[string]any, key string) string {
	s, _ := m[key].(string)
	return s
}

func splitIDs(raw string) []string {
	if raw == "" {
		return nil
	}
	out := make([]string, 0)
	for _, part := range strings.Split(raw, ",") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func boolParam(q url.Values, name string) (value, present bool) {
	vals, ok := q[name]
	if !ok || len(vals) == 0 {
		return false, false
	}
	// Node's booleanQuery only accepts "true"/"false"; a present-but-empty or
	// otherwise-invalid value is falsy (`?? true` then yields the value).
	return vals[0] == "true", true
}

// getClubs is GET /api/clubs/all.
func (h *Handlers) getClubs(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	q := r.URL.Query()
	ids := splitIDs(q.Get("ids"))
	wpm, hasWPM := boolParam(q, "withPlayersAndManager")
	unclaimed, _ := boolParam(q, "unclaimed")

	var (
		clubs []map[string]any
		err   error
	)
	ctx := r.Context()
	switch {
	case len(ids) > 0:
		clubs, err = h.repo.FindAll(ctx, Filter{IDs: ids}, ReadOptions{WithPlayersAndManager: hasWPM && wpm})
	case unclaimed:
		clubs, err = h.repo.FindAll(ctx, Filter{Unclaimed: true}, ReadOptions{})
	default:
		clubs, err = h.repo.FindAll(ctx, Filter{}, ReadOptions{WithPlayersAndManager: !hasWPM || wpm})
	}
	if err != nil {
		return httpapi.Fail(400, "Error fetching Clubs", err.Error())
	}
	return httpapi.OK("Clubs fetched successfully", clubs)
}

// getClub is GET /api/clubs/{id}.
func (h *Handlers) getClub(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	q := r.URL.Query()
	_, hasPopulate := q["populate"]
	populate := hasPopulate && q.Get("populate") != "false"
	club, ok, err := h.repo.FindByID(r.Context(), r.PathValue("id"), ReadOptions{WithPlayersAndManager: populate})
	if err != nil {
		return httpapi.Fail(404, err.Error(), nil)
	}
	if !ok {
		return httpapi.Fail(404, "Club not found", nil)
	}
	return httpapi.OK("Club fetched successfully", club)
}

// createClub is POST /api/clubs/new.
func (h *Handlers) createClub(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	club, err := h.repo.Create(r.Context(), body(cx))
	if err != nil {
		return httpapi.Fail(400, "Error creating club", err.Error())
	}
	return httpapi.OK("Club created successfully", club)
}

// updateClub is POST /api/clubs/{id}/update.
func (h *Handlers) updateClub(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	club, ok, err := h.repo.Update(r.Context(), r.PathValue("id"), body(cx))
	if err != nil {
		return httpapi.Fail(400, "Error updating Club", err.Error())
	}
	if !ok {
		return httpapi.OK("Club updated successfully", nil)
	}
	return httpapi.OK("Club updated successfully", club)
}

// deleteClub is DELETE /api/clubs/{id}.
func (h *Handlers) deleteClub(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	id := r.PathValue("id")
	club, ok, err := h.repo.Delete(r.Context(), id)
	if err != nil {
		return httpapi.Fail(400, "Error deleting Club", err.Error())
	}
	if !ok {
		return httpapi.Fail(400, "Error deleting Club", "Club ["+id+"] does not exist")
	}
	return httpapi.OK("Club deleted successfully", club)
}

// addPlayerToClub is PUT /api/clubs/{id}/add-player.
func (h *Handlers) addPlayerToClub(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	return h.togglePlayer(cx, r, "Player added to Club successfully")
}

// removePlayerFromClub is PUT /api/clubs/{id}/remove-player.
func (h *Handlers) removePlayerFromClub(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	// Node uses the same message logic on both add/remove: remove=true →
	// "removed", otherwise "added".
	return h.togglePlayer(cx, r, "Player added to Club successfully")
}

func (h *Handlers) togglePlayer(cx *httpapi.Context, r *http.Request, addedMessage string) httpapi.Response {
	ctx := r.Context()
	id := r.PathValue("id")
	data := body(cx)
	remove, _ := boolParam(r.URL.Query(), "remove")

	var clubCode, clubID any
	if !remove {
		if v, ok := data["clubCode"]; ok {
			clubCode = v
		}
		if v, ok := data["clubId"]; ok {
			clubID = v
		}
	}
	if _, err := h.players.ToggleSigned(ctx, str(data, "playerId"), asBool(data["isSigned"]), clubCode, clubID); err != nil {
		return httpapi.Fail(400, "Error updating Players and Clubs", err.Error())
	}
	club, ok, err := h.repo.CalculateAndUpdateClubRating(ctx, id)
	if err != nil {
		return httpapi.Fail(400, "Error updating Players and Clubs", err.Error())
	}
	if !ok {
		return httpapi.Fail(400, "Error updating Players and Clubs", "Club ["+id+"] does not exist")
	}
	message := addedMessage
	if remove {
		message = "Player removed from Club successfully"
	}
	return httpapi.OK(message, club)
}

// addManyPlayersToClub is PUT /api/clubs/{id}/add-many-players.
func (h *Handlers) addManyPlayersToClub(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	id := r.PathValue("id")
	data := body(cx)
	ids := stringSlice(data["playerIds"])
	if err := h.players.SignMany(ctx, ids, str(data, "clubCode"), str(data, "clubId")); err != nil {
		return httpapi.Fail(400, "Error adding player to club", err.Error())
	}
	club, ok, err := h.repo.CalculateAndUpdateClubRating(ctx, id)
	if err != nil {
		return httpapi.Fail(400, "Error adding player to club", err.Error())
	}
	if !ok {
		return httpapi.Fail(400, "Error adding player to club", "Club ["+id+"] does not exist")
	}
	return httpapi.OK("Players added to Club successfully", club)
}

// refreshAllClubsRatings is PUT /api/clubs/refresh-ratings.
func (h *Handlers) refreshAllClubsRatings(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if err := h.repo.RefreshAll(r.Context()); err != nil {
		return httpapi.Fail(400, "Error fetching Club", err.Error())
	}
	return httpapi.OK("Players and Clubs updated successfully! Year ENDED :)", map[string]any{})
}

// hireManager is PUT /api/clubs/{id}/manager.
func (h *Handlers) hireManager(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	clubID := r.PathValue("id")
	data := body(cx)

	manager, ok, err := h.managers.ManagerByID(ctx, str(data, "manager"))
	if err != nil {
		return httpapi.Fail(400, "Error hiring new manager!", err.Error())
	}
	if !ok {
		return httpapi.Fail(400, "Error hiring new manager!", "Manager does not exist!")
	}
	club, found, err := h.repo.FindByID(ctx, clubID, ReadOptions{})
	if err != nil {
		return httpapi.Fail(400, "Error hiring new manager!", err.Error())
	}
	if !found {
		return httpapi.Fail(400, "Error hiring new manager!", "Club does not exist!")
	}
	if db.StringField(club, "ManagerId") != "" {
		return httpapi.Fail(401, "Error hiring new manager!",
			"Club already has a manager. Remove manager before you can hire a new one")
	}
	details, _ := data["details"]
	title := str(manager, "FirstName") + " " + str(manager, "LastName") + " joined " + str(club, "Name") + " as their new manager"
	if _, err := h.managers.AppendManagerRecord(ctx, str(manager, "_id"),
		map[string]any{"isEmployed": true, "ClubId": str(club, "_id")},
		map[string]any{"type": "hired", "title": title, "date": time.Now(), "details": details, "club": str(club, "_id")}); err != nil {
		return httpapi.Fail(400, "Error hiring new manager!", err.Error())
	}
	_, err = h.repo.AppendRecord(ctx, clubID, map[string]any{"ManagerId": str(manager, "_id")}, map[string]any{
		"type": "manager-hire", "title": "Hired " + str(manager, "FirstName") + " " + str(manager, "LastName") + " as new manager!",
		"date": time.Now(), "details": details, "manager": str(manager, "_id"),
	})
	if err != nil {
		return httpapi.Fail(400, "Error hiring new manager!", err.Error())
	}
	return httpapi.OK("Hired new manager successfully!", map[string]any{})
}

// fireManager is DELETE /api/clubs/{id}/manager.
func (h *Handlers) fireManager(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	clubID := r.PathValue("id")
	reason := r.URL.Query().Get("reason")
	club, ok, err := h.repo.FindByID(ctx, clubID, ReadOptions{})
	if err != nil {
		return httpapi.Fail(400, "Error removing Manager!", err.Error())
	}
	if !ok {
		return httpapi.Fail(400, "Error removing Manager!", "Club does not exist!")
	}
	manager, err := h.managers.AppendManagerRecord(ctx, db.StringField(club, "ManagerId"),
		map[string]any{"isEmployed": false, "ClubId": nil},
		map[string]any{"type": "manager-leaving", "title": "Left " + str(club, "Name") + " as their new manager.",
			"date": time.Now(), "club": clubID, "details": reason})
	if err != nil {
		return httpapi.Fail(400, "Error removing Manager!", err.Error())
	}
	if manager == nil {
		return httpapi.Fail(400, "Error removing Manager!", "Manager does not exist!")
	}
	_, err = h.repo.AppendRecord(ctx, clubID, map[string]any{"ManagerId": nil}, map[string]any{
		"type": "manager-leaving", "title": "Manager " + str(manager, "FirstName") + " " + str(manager, "LastName") + " left the club",
		"date": time.Now(), "manager": str(manager, "_id"), "details": reason,
	})
	if err != nil {
		return httpapi.Fail(400, "Error removing Manager!", err.Error())
	}
	return httpapi.OK("Removed Manager successfully!", map[string]any{})
}

// recruitYouthPlayers is POST /api/clubs/{id}/recruit-youth. Reproduces the
// Youth-Academy/cooldown/squad-cap gate from player-lifecycle.service.ts:409
// for owners; admins scout freely. Youth are 16-18 and a TransferLedger
// 'youth_scouted' row is written. Worldgen names/nationality are not ported.
func (h *Handlers) recruitYouthPlayers(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	id := r.PathValue("id")
	data := body(cx)
	club, ok, err := h.repo.FindByID(ctx, id, ReadOptions{})
	if err != nil {
		return httpapi.Fail(400, "Error recruiting youth players", err.Error())
	}
	if !ok {
		return httpapi.Fail(400, "Club not found", "Club not found")
	}

	asAdmin := isAdminUser(ctx, h.repo.Q(), cx.Session.UserID())
	count := 1
	if asAdmin {
		if c := intOf(data["count"]); c >= 1 {
			count = c
		}
		if count > 3 {
			count = 3
		}
	} else if refusal := youthRefusal(ctx, h.repo.Q(), id); refusal != "" {
		return httpapi.Fail(400, refusal, refusal)
	}

	rng := h.rand()
	recruits := make([]any, 0, count)
	for i := 0; i < count; i++ {
		generated := player.GenerateYouth("", rng)
		generated["isSigned"] = true
		generated["ClubId"] = id
		generated["ClubCode"] = str(club, "ClubCode")
		field, counterID, cerr := player.NextCounterID(ctx, h.players.Q(), "player")
		if cerr != nil {
			return httpapi.Fail(400, "Error recruiting youth players", cerr.Error())
		}
		generated[field] = counterID
		saved, serr := h.players.Create(ctx, generated)
		if serr != nil {
			return httpapi.Fail(400, "Error recruiting youth players", serr.Error())
		}
		recruits = append(recruits, saved)
	}

	note := "Promoted from the youth academy"
	if asAdmin {
		note = fmt.Sprintf("%d youth player(s) scouted by admin", len(recruits))
	}
	if _, lerr := h.repo.Q().Exec(ctx,
		`INSERT INTO "TransferLedger" ("Type", "BuyerClubId", "Amount", "Note", "updatedAt") VALUES ('youth_scouted', $1, 0, $2, now())`,
		id, note); lerr != nil {
		return httpapi.Fail(400, "Error recruiting youth players", lerr.Error())
	}
	return httpapi.OK("Youth player(s) recruited successfully", recruits)
}

// isAdminUser reports whether userID exists and is an admin.
func isAdminUser(ctx context.Context, q db.Querier, userID string) bool {
	if userID == "" {
		return false
	}
	var isAdmin bool
	if err := q.QueryRow(ctx, `SELECT "isAdmin" FROM "Users" WHERE "_id" = $1`, userID).Scan(&isAdmin); err != nil {
		return false
	}
	return isAdmin
}

// maxSquadForPromotion mirrors player-lifecycle.service.ts's constant.
const maxSquadForPromotion = 28

// youthRefusal mirrors youthPromotionRefusal: the reason an owner cannot
// promote a youngster right now, or "" when allowed.
func youthRefusal(ctx context.Context, q db.Querier, clubID string) string {
	var tier int
	if err := q.QueryRow(ctx,
		`SELECT COALESCE((SELECT "Level" FROM "ClubAssets" WHERE "ClubId" = $1 AND "AssetType" = 'youth_academy'), 0)`,
		clubID).Scan(&tier); err != nil {
		return "Could not read the youth academy"
	}
	if tier < 1 {
		return "Build a Youth Academy to bring through your own players"
	}

	var signed int
	if err := q.QueryRow(ctx,
		`SELECT count(*)::int FROM "Players" WHERE "ClubId" = $1 AND "isSigned" = true AND "isRetired" = false`,
		clubID).Scan(&signed); err != nil {
		return "Could not read the squad"
	}
	if signed >= maxSquadForPromotion {
		return fmt.Sprintf("Your squad is full (%d players)", maxSquadForPromotion)
	}

	var last *time.Time
	if err := q.QueryRow(ctx,
		`SELECT "createdAt" FROM "TransferLedger" WHERE "Type" = 'youth_scouted' AND "BuyerClubId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
		clubID).Scan(&last); err != nil && err != pgx.ErrNoRows {
		return "Could not read the academy cooldown"
	}
	if last != nil {
		cooldownHours := scaledHours(24.0 / float64(tier))
		readyAt := last.Add(time.Duration(cooldownHours * float64(time.Hour)))
		if readyAt.After(time.Now()) {
			return "The academy's next prospect is ready in " + describeHours(time.Until(readyAt).Hours())
		}
	}
	return ""
}

// scaledHours mirrors game-time.ts's scaled(): divide by GAME_TIME_SCALE.
func scaledHours(hours float64) float64 {
	scale := 1.0
	if v := strings.TrimSpace(os.Getenv("GAME_TIME_SCALE")); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
			scale = f
		}
	}
	if scale < 0.01 {
		scale = 0.01
	}
	return hours / scale
}

// describeHours mirrors game-time.ts's describeHours.
func describeHours(hours float64) string {
	if hours >= 1 {
		h := math.Round(hours*10) / 10
		if h == 1 {
			return "1 hour"
		}
		return fmt.Sprintf("%v hours", h)
	}
	m := int(math.Max(math.Round(hours*60), 1))
	if m == 1 {
		return "1 minute"
	}
	return fmt.Sprintf("%d minutes", m)
}

// getMediaFeed is GET /api/clubs/{id}/media-feed. The Node media hub is large
// and depends on fixtures/awards; this port returns an empty feed (documented).
func (h *Handlers) getMediaFeed(_ *httpapi.Context, _ http.ResponseWriter, _ *http.Request) httpapi.Response {
	return httpapi.OK("Media feed fetched successfully", []any{})
}

// getClubPerformance is GET /api/clubs/{id}/performance. The Node analytics
// service is out of scope for this batch; return a clear 400 rather than a
// wrong shape.
func (h *Handlers) getClubPerformance(_ *httpapi.Context, _ http.ResponseWriter, _ *http.Request) httpapi.Response {
	return httpapi.Fail(400, "Club performance is not available in the Go server yet", nil)
}

// suggestLineup is POST /api/clubs/{id}/lineup-suggestion.
func (h *Handlers) suggestLineup(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	body, _ := cx.BodyMap()
	if body == nil {
		body = map[string]any{}
	}
	slots := []LineupSlot{}
	if list, ok := body["slots"].([]any); ok {
		for _, s := range list {
			m, _ := s.(map[string]any)
			if m == nil {
				continue
			}
			slots = append(slots, LineupSlot{Label: db.StringField(m, "label"), Pos: db.StringField(m, "pos")})
		}
	}
	result, err := h.repo.SuggestLineup(r.Context(), r.PathValue("id"), db.StringField(body, "formation"), db.StringField(body, "style"), slots)
	if err != nil {
		msg := err.Error()
		status := 400
		if strings.Contains(strings.ToLower(msg), "not found") {
			status = 404
		}
		return httpapi.Fail(status, msg, msg)
	}
	return httpapi.OK("Lineup suggested", result)
}

func stringSlice(v any) []string {
	list, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(list))
	for _, item := range list {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func intOf(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int8:
		return int(n)
	case int16:
		return int(n)
	case int32:
		return int(n)
	case int64:
		return int(n)
	case float32:
		return int(n)
	case float64:
		return int(n)
	default:
		return 0
	}
}

func asBool(v any) bool {
	b, _ := v.(bool)
	return b
}
