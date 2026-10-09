package player

import (
	"log/slog"
	"math"
	"math/rand"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
)

// Handlers implements the players.* routes.
type Handlers struct {
	repo   *Repository
	logger *slog.Logger

	mu  sync.Mutex
	rng *rand.Rand
}

// New builds the handler set.
func New(repo *Repository, logger *slog.Logger) *Handlers {
	if logger == nil {
		logger = slog.Default()
	}
	return &Handlers{repo: repo, logger: logger, rng: rand.New(rand.NewSource(time.Now().UnixNano()))}
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

func ageOf(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case float32:
		return int(n)
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
	default:
		return 0
	}
}

func asAttributes(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return nil
}

// truthy mirrors JS truthiness for the updatePlayer trigger conditions.
func truthy(v any) bool {
	switch t := v.(type) {
	case nil:
		return false
	case bool:
		return t
	case string:
		return t != ""
	case float64:
		return t != 0
	case int:
		return t != 0
	case int64:
		return t != 0
	default:
		return true
	}
}

// nullishValue returns data[key] when it is present and non-nil, else
// fallback[key] (mirrors JS `data.X ?? existing.X`).
func nullishValue(data, fallback map[string]any, key string) any {
	if v, ok := data[key]; ok && v != nil {
		return v
	}
	return fallback[key]
}

// nullishString is nullishValue for string fields, preserving an explicit "".
func nullishString(data map[string]any, key string, fallback map[string]any, fallbackKey string) string {
	if v, ok := data[key]; ok && v != nil {
		s, _ := v.(string)
		return s
	}
	s, _ := fallback[fallbackKey].(string)
	return s
}

// boolQuery parses a booleanQuery() param. Only "true"/"false" are valid; any
// other value is treated as absent (Node's zod validation would 400).
func boolQuery(q url.Values, name string) (value, present bool) {
	vals, ok := q[name]
	if !ok || len(vals) == 0 {
		return false, false
	}
	switch vals[0] {
	case "true":
		return true, true
	case "false":
		return false, true
	default:
		return false, false
	}
}

// getPlayers is GET /api/players/all.
func (h *Handlers) getPlayers(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	q := r.URL.Query()
	filter := Filter{}
	if v := q.Get("club"); v != "" {
		filter.ClubID, filter.HasClubID = v, true
	}
	if v := q.Get("clubCode"); v != "" {
		filter.ClubCode, filter.HasClubCode = v, true
	}
	if v := q.Get("excludeClubId"); v != "" {
		filter.ExcludeClub, filter.HasExclude = v, true
	}
	if v, ok := boolQuery(q, "isSigned"); ok {
		filter.IsSigned, filter.HasIsSigned = v, true
	}
	players, err := h.repo.FindAll(r.Context(), filter, false)
	if err != nil {
		return httpapi.Fail(400, "Error fetching players", err.Error())
	}
	return httpapi.OK("Players fetched successfully", players)
}

// updatePlayer is POST /api/players/{id}/update.
func (h *Handlers) updatePlayer(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	id := r.PathValue("id")
	data := body(cx)

	if truthy(data["Attributes"]) || truthy(data["Position"]) || truthy(data["Role"]) || truthy(data["Age"]) {
		existing, _, err := h.repo.FindByID(ctx, id, false)
		if err != nil {
			return httpapi.Fail(400, "Error updating Player", err.Error())
		}
		attributes := asAttributes(data["Attributes"])
		if attributes == nil {
			attributes = asAttributes(existing["Attributes"])
		}
		position := nullishString(data, "Position", existing, "Position")
		role := nullishString(data, "Role", existing, "Role")
		age := ageOf(nullishValue(data, existing, "Age"))
		if attributes != nil && position != "" && role != "" {
			rating := math.Round(CalculatePlayerRating(attributes, position, role))
			data["Rating"] = rating
			data["Value"] = CalculatePlayerValue(position, rating, age)
		}
	}

	updated, ok, err := h.repo.Update(ctx, id, data)
	if err != nil {
		return httpapi.Fail(400, "Error updating Player", err.Error())
	}
	if !ok {
		return httpapi.OK("Player updated successfully", nil)
	}
	return httpapi.OK("Player updated successfully", updated)
}

// createPlayer is POST /api/players/new.
func (h *Handlers) createPlayer(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	data := db.CopyMap(body(cx))
	attributes := asAttributes(data["Attributes"])
	position := str(data, "Position")
	role := str(data, "Role")
	age := ageOf(data["Age"])
	rating := num(data["Rating"])
	if attributes != nil && position != "" && role != "" {
		rating = math.Round(CalculatePlayerRating(attributes, position, role))
		data["Rating"] = rating
	}
	value := CalculatePlayerValue(position, rating, age)
	data["Value"] = value
	data["Wage"] = CalculatePlayerWage(value)

	field, counterID, err := NextCounterID(ctx, h.repo.q, "player")
	if err != nil {
		return httpapi.Fail(400, "Error creating player", err.Error())
	}
	data[field] = counterID
	created, err := h.repo.Create(ctx, data)
	if err != nil {
		return httpapi.Fail(400, "Error creating player", err.Error())
	}
	return httpapi.OK("Player created successfully", created)
}

// getPlayerRating is GET /api/players/{id}/rating.
func (h *Handlers) getPlayerRating(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	found, ok, err := h.repo.FindByID(ctx, r.PathValue("id"), false)
	if err != nil {
		// Node's catch returns 400 with the error text as the message (no
		// payload), so a DB error must not masquerade as "not found".
		return httpapi.Fail(400, err.Error(), nil)
	}
	if !ok {
		return httpapi.Fail(400, "Player not found!", nil)
	}
	rating := math.Round(CalculatePlayerRating(asAttributes(found["Attributes"]), str(found, "Position"), str(found, "Role")))
	value := CalculatePlayerValue(str(found, "Position"), rating, ageOf(found["Age"]))
	return httpapi.OK("Player Rating and Value successfully", map[string]any{
		"new_rating": rating,
		"new_value":  value,
	})
}

// getPlayerStats is GET /api/players/stats.
func (h *Handlers) getPlayerStats(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	q := r.URL.Query()
	sortBy := q.Get("sortBy")
	if sortBy == "" {
		sortBy = "points"
	}
	sortDir := q.Get("sortDir")
	if sortDir != "asc" {
		sortDir = "desc"
	}
	stats, err := GetSpecificPlayerStats(r.Context(), h.repo, q.Get("competitionCode"), q.Has("competitionCode"), sortBy, sortDir)
	if err != nil {
		return httpapi.Fail(400, "Error fetching Player stats", err.Error())
	}
	if len(stats) > 5 {
		stats = stats[:5]
	}
	return httpapi.OK("The Best 5 Players by "+upper(sortBy), stats)
}

// generatePlayers is GET /api/players/generate-players (dev/admin helper). The
// Node route shells out to a child process; this port generates locally.
func (h *Handlers) generatePlayers(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if !generateEnabled() {
		return httpapi.Fail(400, "Error generating Players",
			"generatePlayers is disabled (set ENABLE_PLAYER_GENERATION=true to enable the local generator)")
	}
	q := r.URL.Query()
	count, err := strconv.Atoi(q.Get("number"))
	if err != nil || count < 1 {
		return httpapi.Fail(400, "Error generating Players", "number must be a positive integer")
	}
	if count > 100 {
		count = 100
	}
	ctx := r.Context()
	rng := h.rand()
	created := make([]any, 0, count)
	for i := 0; i < count; i++ {
		data := GeneratePlayer(q.Get("position"), q.Get("culture"), rng)
		field, counterID, cerr := NextCounterID(ctx, h.repo.q, "player")
		if cerr != nil {
			return httpapi.Fail(400, "Error generating Players", cerr.Error())
		}
		data[field] = counterID
		saved, serr := h.repo.Create(ctx, data)
		if serr != nil {
			return httpapi.Fail(400, "Error generating Players", serr.Error())
		}
		created = append(created, saved)
	}
	return httpapi.OK("Players generated successfully!", created)
}

// getPlayer is GET /api/players/{id}.
func (h *Handlers) getPlayer(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	found, ok, err := h.repo.FindByID(r.Context(), r.PathValue("id"), false)
	if err != nil {
		return httpapi.Fail(400, "Error fetching Player", err.Error())
	}
	if !ok {
		return httpapi.OK("Player fetched successfully", nil)
	}
	return httpapi.OK("Player fetched successfully", found)
}

// deletePlayer is DELETE /api/players/{id}.
func (h *Handlers) deletePlayer(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	id := r.PathValue("id")
	deleted, ok, err := h.repo.Delete(r.Context(), id)
	if err != nil {
		return httpapi.Fail(400, "Error deleting Player => ", err.Error())
	}
	if !ok {
		return httpapi.Fail(400, "Error deleting Player => ", "Player ["+id+"] does not exist")
	}
	return httpapi.OK("Player deleted successfully", deleted)
}

func upper(s string) string {
	b := []byte(s)
	for i := range b {
		if b[i] >= 'a' && b[i] <= 'z' {
			b[i] -= 32
		}
	}
	return string(b)
}
