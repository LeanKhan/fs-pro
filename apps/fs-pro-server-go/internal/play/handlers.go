package play

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"fs-pro-server/internal/auth"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/grid"
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
	// grids/clubs back the scout screen. They are nil in production (the
	// pgx-backed defaults wrap repo.Q()); tests inject fakes.
	grids grid.Repository
	clubs grid.ClubReader
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
	// A club that has spent its weekly ranked-attack allowance cannot search
	// for another ranked raid (04 §4.3). Signed-up clubs only; a club that has
	// not joined this week's pool is unaffected.
	used, allowed, signedUp, err := h.repo.weeklyAttackAllowance(ctx, clubID, h.repo.clock())
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	if signedUp && used >= allowed {
		msg := weeklyAttackCapMessage(allowed)
		return httpapi.Fail(400, msg, msg)
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

// playMatch is POST /api/play/{clubId}/match: resolves the club's async raid.
// It reproduces the PLAY gate (409), then queues + resolves the raid against a
// scouted opponent (02 §D, 05 §5). The body may carry Manager Orders, a
// one-match layout override and a `practice` flag (a no-stakes friendly, 02 §D2).
func (h *Handlers) playMatch(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	recordRaidAttempt()
	ctx := r.Context()
	clubID := r.PathValue("clubId")
	body, _ := cx.BodyMap()
	opts, code, err := h.playOptions(ctx, clubID, body)
	if err != nil {
		return httpapi.Fail(code, err.Error(), err.Error())
	}
	result, err := h.repo.PlayMatch(ctx, clubID, opts)
	if err != nil {
		if gate, ok := err.(PlayGateError); ok {
			return httpapi.Fail(409, gate.Message, gate.Message)
		}
		if strings.Contains(strings.ToLower(err.Error()), "not found") {
			return httpapi.Fail(404, err.Error(), err.Error())
		}
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	state, code, err := h.playState(ctx, clubID)
	if err != nil {
		return httpapi.Fail(code, err.Error(), nil)
	}
	result["state"] = state
	return httpapi.OK("Match played", result)
}

// playOptions validates the optional raid inputs from a playMatch body. The
// layout override is validated server-side at the attacker's Clubhouse tier.
func (h *Handlers) playOptions(ctx context.Context, clubID string, body map[string]any) (PlayOptions, int, error) {
	opts := PlayOptions{}
	if body == nil {
		return opts, 200, nil
	}
	if id, ok := body["opponentId"].(string); ok {
		opts.OpponentID = id
	}
	if watch, ok := body["watch"].(bool); ok {
		opts.Watch = watch
	}
	if practice, ok := body["practice"].(bool); ok {
		opts.Practice = practice
	}
	if orders, ok := body["orders"].([]any); ok {
		opts.Orders = orders
	}
	if raw, ok := body["effects"].(map[string]any); ok {
		opts.Effects = effectsByPlayer(raw)
	}
	if raw, ok := body["layout"]; ok && raw != nil {
		blob, err := json.Marshal(raw)
		if err != nil {
			return opts, 400, errors.New("That layout could not be read")
		}
		var g grid.Grid
		if err := json.Unmarshal(blob, &g); err != nil {
			return opts, 400, errors.New("That layout could not be read")
		}
		tier, err := h.repo.clubhouseTier(ctx, clubID)
		if err != nil {
			return opts, 400, err
		}
		if reason := grid.Validate(g, tier); reason != "" {
			return opts, 400, errors.New(reason)
		}
		opts.Layout = &g
	}
	return opts, 200, nil
}

// effectsByPlayer coerces the `effects` body map (player id -> list) into the
// []any form the sim request builder attaches to players.
func effectsByPlayer(raw map[string]any) map[string][]any {
	if len(raw) == 0 {
		return nil
	}
	out := make(map[string][]any, len(raw))
	for id, v := range raw {
		if list, ok := v.([]any); ok && len(list) > 0 {
			out[id] = list
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// claimBoardVault is POST /api/play/{clubId}/board-vault/claim (04 §5.2).
func (h *Handlers) claimBoardVault(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	result, err := h.repo.ClaimBoardVault(r.Context(), r.PathValue("clubId"))
	if err != nil {
		switch {
		case errors.Is(err, ErrRaidsClubNotFound):
			return httpapi.Fail(404, "Club not found", nil)
		case errors.Is(err, ErrBoardVaultEmpty):
			return httpapi.Fail(409, "Nothing to claim from the Board Vault", "Nothing to claim from the Board Vault")
		default:
			return httpapi.Fail(400, err.Error(), err.Error())
		}
	}
	return httpapi.OK("Board vault claimed", result)
}

// defenseLog is GET /api/play/{clubId}/defenses: the defender's recent raid
// results (02 §E).
func (h *Handlers) defenseLog(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	log, err := h.repo.DefenseLog(r.Context(), r.PathValue("clubId"), 20)
	if err != nil {
		if errors.Is(err, ErrRaidsClubNotFound) {
			return httpapi.Fail(404, "Club not found", nil)
		}
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	return httpapi.OK("Defense log", log)
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
// playFail maps a play-service error like Node's errorResponse.
func playFail(err error) httpapi.Response {
	msg := err.Error()
	status := 400
	if strings.Contains(strings.ToLower(msg), "not found") {
		status = 404
	}
	return httpapi.Fail(status, msg, msg)
}

// collectShop is POST /api/play/{clubId}/shop/collect.
func (h *Handlers) collectShop(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	result, err := h.repo.CollectShop(r.Context(), r.PathValue("clubId"))
	if err != nil {
		return playFail(err)
	}
	return httpapi.OK("Shop takings collected", result)
}

// prepFail maps a PrepError to its status, else 400.
func prepFail(err error) httpapi.Response {
	if pe, ok := err.(PrepError); ok {
		return httpapi.Fail(pe.Status, pe.Message, pe.Message)
	}
	return httpapi.Fail(400, err.Error(), err.Error())
}

// bookMatch is POST /api/play/{clubId}/book.
func (h *Handlers) bookMatch(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	body, _ := cx.BodyMap()
	opponentID := ""
	if body != nil {
		opponentID = db.StringField(body, "opponentId")
	}
	fixture, err := h.repo.BookMatch(r.Context(), r.PathValue("clubId"), opponentID)
	if err != nil {
		return prepFail(err)
	}
	return httpapi.OK("Match booked", fixture)
}

// getMatchPrep is GET .../prep.
func (h *Handlers) getMatchPrep(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	prep, err := h.repo.GetMatchPrep(r.Context(), r.PathValue("clubId"), r.PathValue("fixtureId"))
	if err != nil {
		return prepFail(err)
	}
	return httpapi.OK("Match prep", prep)
}

// saveMatchPlan is PUT .../plan.
func (h *Handlers) saveMatchPlan(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	body, _ := cx.BodyMap()
	plan := mapOf(body["plan"])
	if plan == nil {
		return httpapi.Fail(400, "A plan is required", nil)
	}
	asDefault, _ := body["asDefault"].(bool)
	prep, err := h.repo.SaveMatchPlan(r.Context(), r.PathValue("clubId"), r.PathValue("fixtureId"), plan, asDefault)
	if err != nil {
		return prepFail(err)
	}
	return httpapi.OK("Plan saved", prep)
}

// previewMatchPlan is POST .../preview.
func (h *Handlers) previewMatchPlan(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	body, _ := cx.BodyMap()
	plan := mapOf(body["plan"])
	if plan == nil {
		return httpapi.Fail(400, "A plan is required", nil)
	}
	preview, err := h.repo.PreviewMatchPlan(r.Context(), r.PathValue("clubId"), r.PathValue("fixtureId"), plan)
	if err != nil {
		return prepFail(err)
	}
	return httpapi.OK("Plan preview", preview)
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
