package play

import (
	"context"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"fs-pro-server/internal/auth"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
)

// sessionUser reads the signed-in user id from the request context.
func sessionUser(cx *httpapi.Context) string {
	if cx != nil && cx.Session != nil {
		return cx.Session.UserID()
	}
	return ""
}

// requireClub enforces Node's canManageClub for the clubId path param. It
// returns (denial, false) when access is refused.
func (h *Handlers) requireClub(cx *httpapi.Context, r *http.Request) (httpapi.Response, bool) {
	status, msg := auth.CanManageClub(r.Context(), h.repo.Q(), sessionUser(cx), r.PathValue("clubId"))
	if status != 0 {
		return httpapi.Fail(status, msg, nil), false
	}
	return httpapi.Response{}, true
}

// Handlers implements the play.* routes.
type Handlers struct {
	repo *Repository
}

// New builds the handler set.
func New(repo *Repository) *Handlers { return &Handlers{repo: repo} }

func (h *Handlers) getPlayState(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	state, code, err := h.playState(r.Context(), r.PathValue("clubId"))
	if err != nil {
		return httpapi.Fail(code, err.Error(), nil)
	}
	return httpapi.OK("Play state", state)
}

func (h *Handlers) playState(ctx context.Context, clubID string) (map[string]any, int, error) {
	club, ok, err := h.repo.Club(ctx, clubID)
	if err != nil {
		return nil, 400, err
	}
	if !ok {
		return nil, 404, errClubNotFound
	}
	thresholds := h.repo.LevelThresholds(ctx)
	xp := floatOf(club["XP"])
	level, into, next := levelInfo(thresholds, xp)
	cooldown, err := h.cooldown(ctx, clubID)
	if err != nil {
		return nil, 400, err
	}
	recent, err := h.recent(ctx, clubID)
	if err != nil {
		return nil, 400, err
	}

	state := map[string]any{
		"club": map[string]any{
			"id":          db.StringField(club, "_id"),
			"name":        db.StringField(club, "Name"),
			"rating":      floatOf(club["Rating"]),
			"power":       power(floatOf(club["Rating"])),
			"xp":          xp,
			"level":       level,
			"xpIntoLevel": into,
			"xpForNext":   next,
			"budget":      floatOf(club["Budget"]),
		},
		"standing": map[string]any{
			"fans":            intOf(club["Fans"]),
			"reputation":      intOf(club["Reputation"]),
			"boardConfidence": intOf(club["BoardConfidence"]),
			"fanApproval":     50,
			"squadMorale":     60,
			"form":            []any{},
			"streak":          nil,
		},
		"cooldownSeconds": cooldown,
		"challenge": map[string]any{
			"id": "", "title": "", "targetWins": 0, "wins": 0, "matchesPlayed": 0,
			"status": "active", "expiresAt": time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
			"secondsLeft": 0, "rewardCash": 0, "rewardXP": 0,
		},
		"recent": recent,
		"shop":   map[string]any{"pending": 0, "cap": 0, "perHour": 0, "secondsToFull": 0},
		"league": nil,
	}
	return state, 200, nil
}

func (h *Handlers) cooldown(ctx context.Context, clubID string) (int, error) {
	playedAt, err := h.repo.LastMatchmadePlayedAt(ctx, clubID)
	if err != nil || playedAt == "" {
		return 0, err
	}
	t, perr := time.Parse("2006-01-02T15:04:05.000Z", playedAt)
	if perr != nil {
		return 0, nil
	}
	elapsed := time.Since(t).Seconds()
	left := float64(matchCooldownSeconds()) - elapsed
	if left < 0 {
		return 0, nil
	}
	return int(left + 0.999), nil
}

func (h *Handlers) recent(ctx context.Context, clubID string) ([]any, error) {
	rows, err := h.repo.RecentMatchmade(ctx, clubID, 5)
	if err != nil {
		return nil, err
	}
	ids := []string{}
	for _, row := range rows {
		if id := db.StringField(row, "AwayTeamId"); id != "" {
			ids = append(ids, id)
		}
	}
	names, err := h.repo.ClubNames(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make([]any, 0, len(rows))
	for _, row := range rows {
		opp := db.StringField(row, "AwayTeamId")
		home, away := scoresOf(row["Details"])
		playedAt := db.StringField(row, "PlayedAt")
		if playedAt == "" {
			playedAt = db.StringField(row, "updatedAt")
		}
		name := "Unknown"
		if opp != "" {
			if o := names[opp]; o != nil {
				name = db.StringField(o, "Name")
			}
		}
		out = append(out, map[string]any{
			"fixtureId": db.StringField(row, "_id"),
			"opponent":  name,
			"score":     itoa(home) + " - " + itoa(away),
			"outcome":   outcomeFor(home, away),
			"playedAt":  playedAt,
		})
	}
	return out, nil
}

// findOpponents is GET /api/play/{clubId}/opponents.
func (h *Handlers) findOpponents(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	clubID := r.PathValue("clubId")
	club, ok, err := h.repo.Club(ctx, clubID)
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	if !ok {
		return httpapi.Fail(404, "Club not found", nil)
	}
	rows, err := h.repo.Opponents(ctx, clubID, floatOf(club["Rating"]), 5)
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	if len(rows) == 0 {
		return httpapi.Fail(400, "No opponent available right now", "No opponent available right now")
	}
	thresholds := h.repo.LevelThresholds(ctx)
	level, _, _ := levelInfo(thresholds, floatOf(club["XP"]))
	options := 1 + minInt(level/2, 4)
	if options > len(rows) {
		options = len(rows)
	}
	out := make([]any, 0, options)
	for _, row := range rows[:options] {
		out = append(out, opponentOption(row))
	}
	return httpapi.OK("Opponents", out)
}

// playMatch is POST /api/play/{clubId}/match: reproduces the PLAY gate (409);
// the simulation itself is not ported, so a gate-passing request is a declared
// 400.
func (h *Handlers) playMatch(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	clubID := r.PathValue("clubId")
	club, ok, err := h.repo.Club(ctx, clubID)
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	if !ok {
		return httpapi.Fail(404, "Club not found", nil)
	}
	total, gk, err := h.repo.SquadCounts(ctx, clubID)
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	if refusal := GateProblem(db.StringField(club, "ManagerId"), total, gk); refusal != nil {
		return httpapi.Fail(409, refusal.Message, nil)
	}
	return httpapi.Fail(400, "Match simulation is not available in the Go server yet", nil)
}

// getInbox is GET /api/play/{clubId}/inbox.
func (h *Handlers) getInbox(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	inbox, code, err := h.inbox(r.Context(), r.PathValue("clubId"))
	if err != nil {
		return httpapi.Fail(code, err.Error(), nil)
	}
	return httpapi.OK("Inbox", inbox)
}

func (h *Handlers) inbox(ctx context.Context, clubID string) (map[string]any, int, error) {
	if _, ok, err := h.repo.Club(ctx, clubID); err != nil {
		return nil, 400, err
	} else if !ok {
		return nil, 404, errClubNotFound
	}
	rows, err := h.repo.Messages(ctx, clubID)
	if err != nil {
		return nil, 400, err
	}
	unread := 0
	messages := make([]any, 0, len(rows))
	for _, row := range rows {
		read := boolOf(row["Read"])
		if !read {
			unread++
		}
		messages = append(messages, map[string]any{
			"id":        db.StringField(row, "_id"),
			"kind":      db.StringField(row, "Kind"),
			"tone":      db.StringField(row, "Tone"),
			"title":     db.StringField(row, "Title"),
			"body":      db.StringField(row, "Body"),
			"read":      read,
			"createdAt": db.StringField(row, "createdAt"),
		})
	}
	return map[string]any{"unread": unread, "messages": messages}, 200, nil
}

// markInboxRead is POST /api/play/{clubId}/inbox/read.
func (h *Handlers) markInboxRead(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	ctx := r.Context()
	clubID := r.PathValue("clubId")
	if err := h.repo.MarkMessagesRead(ctx, clubID); err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	inbox, code, err := h.inbox(ctx, clubID)
	if err != nil {
		return httpapi.Fail(code, err.Error(), nil)
	}
	return httpapi.OK("Inbox marked read", inbox)
}

// getMatchday is GET /api/play/{clubId}/matchday.
func (h *Handlers) getMatchday(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	matchday, code, err := h.matchday(r.Context(), r.PathValue("clubId"))
	if err != nil {
		return httpapi.Fail(code, err.Error(), nil)
	}
	return httpapi.OK("Matchday", matchday)
}

func (h *Handlers) matchday(ctx context.Context, clubID string) (map[string]any, int, error) {
	if _, ok, err := h.repo.Club(ctx, clubID); err != nil {
		return nil, 400, err
	} else if !ok {
		return nil, 404, errClubNotFound
	}
	upcomingRows, err := h.repo.FixturesForClub(ctx, clubID, false)
	if err != nil {
		return nil, 400, err
	}
	recentRows, err := h.repo.FixturesForClub(ctx, clubID, true)
	if err != nil {
		return nil, 400, err
	}
	upcoming, err := h.matchdayFixtures(ctx, clubID, upcomingRows)
	if err != nil {
		return nil, 400, err
	}
	recent, err := h.matchdayFixtures(ctx, clubID, recentRows)
	if err != nil {
		return nil, 400, err
	}
	return map[string]any{
		"upcoming": upcoming,
		"recent":   recent,
		"bookings": map[string]any{"used": 0, "max": 3},
	}, 200, nil
}

func (h *Handlers) matchdayFixtures(ctx context.Context, clubID string, rows []map[string]any) ([]any, error) {
	out := make([]any, 0, len(rows))
	for _, row := range rows {
		homeID := db.StringField(row, "HomeTeamId")
		awayID := db.StringField(row, "AwayTeamId")
		oppID := awayID
		home := true
		if awayID == clubID {
			oppID, home = homeID, false
		}
		names, err := h.repo.ClubNames(ctx, []string{oppID})
		if err != nil {
			return nil, err
		}
		opp := map[string]any{"id": oppID, "name": "Unknown", "code": "", "power": 0, "human": false}
		if o := names[oppID]; o != nil {
			opp = map[string]any{
				"id":    oppID,
				"name":  db.StringField(o, "Name"),
				"code":  db.StringField(o, "ClubCode"),
				"power": power(floatOf(o["Rating"])),
				"human": false,
			}
		}
		var score any
		if boolOf(row["Played"]) {
			h, a := scoresOf(row["Details"])
			you, them := h, a
			if !home {
				you, them = a, h
			}
			score = map[string]any{"you": you, "them": them}
		}
		var playedAt any
		if s := db.StringField(row, "PlayedAt"); s != "" {
			playedAt = s
		}
		var day any
		if row["ScheduledDay"] != nil {
			day = intOf(row["ScheduledDay"])
		}
		out = append(out, map[string]any{
			"fixtureId":       db.StringField(row, "_id"),
			"kind":            matchdayKind(db.StringField(row, "Type")),
			"title":           db.StringField(row, "Title"),
			"home":            home,
			"opponent":        opp,
			"day":             day,
			"kickoffHour":     nil,
			"startsInSeconds": nil,
			"played":          boolOf(row["Played"]),
			"playedAt":        playedAt,
			"score":           score,
			"planSet":         false,
			"hasReplay":       false,
		})
	}
	return out, nil
}

// collectShop / bookMatch / match-prep / preview are sim/prep-dependent stubs.
func (h *Handlers) collectShop(_ *httpapi.Context, _ http.ResponseWriter, _ *http.Request) httpapi.Response {
	return httpapi.Fail(400, "Shop collection is not available in the Go server yet", nil)
}
func (h *Handlers) bookMatch(_ *httpapi.Context, _ http.ResponseWriter, _ *http.Request) httpapi.Response {
	return httpapi.Fail(400, "Booking matches is not available in the Go server yet", nil)
}
func (h *Handlers) getMatchPrep(_ *httpapi.Context, _ http.ResponseWriter, _ *http.Request) httpapi.Response {
	return httpapi.Fail(400, "Match prep is not available in the Go server yet", nil)
}
func (h *Handlers) saveMatchPlan(_ *httpapi.Context, _ http.ResponseWriter, _ *http.Request) httpapi.Response {
	return httpapi.Fail(400, "Saving a match plan is not available in the Go server yet", nil)
}
func (h *Handlers) previewMatchPlan(_ *httpapi.Context, _ http.ResponseWriter, _ *http.Request) httpapi.Response {
	return httpapi.Fail(400, "Match plan preview is not available in the Go server yet", nil)
}

// --- helpers ---------------------------------------------------------------

var errClubNotFound = errString("Club not found")

type errString string

func (e errString) Error() string { return string(e) }

func scoresOf(details any) (int, int) {
	m, _ := details.(map[string]any)
	return intOf(m["HomeTeamScore"]), intOf(m["AwayTeamScore"])
}

func outcomeFor(yours, theirs int) string {
	switch {
	case yours > theirs:
		return "win"
	case yours < theirs:
		return "loss"
	default:
		return "draw"
	}
}

func opponentOption(row map[string]any) map[string]any {
	var manager any
	if db.StringField(row, "UserId") != "" {
		manager = db.StringField(row, "manager")
		if manager == "" {
			manager = "A manager"
		}
	}
	return map[string]any{
		"id":      db.StringField(row, "_id"),
		"name":    db.StringField(row, "Name"),
		"code":    db.StringField(row, "ClubCode"),
		"power":   power(floatOf(row["Rating"])),
		"human":   db.StringField(row, "UserId") != "",
		"manager": manager,
	}
}

func matchdayKind(t string) string {
	switch t {
	case "friendly":
		return "friendly"
	case "cup", "tournament":
		return "cup"
	case "league":
		return "league"
	default:
		return "friendly"
	}
}

func matchCooldownSeconds() float64 {
	base := 300.0
	if v := strings.TrimSpace(os.Getenv("MATCH_COOLDOWN_SECONDS")); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
			base = f
		}
	}
	if scale := gameScale(); scale > 0 {
		return base / scale
	}
	return base
}

func gameScale() float64 {
	if v := strings.TrimSpace(os.Getenv("GAME_TIME_SCALE")); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f >= 0.01 {
			return f
		}
	}
	return 1
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
