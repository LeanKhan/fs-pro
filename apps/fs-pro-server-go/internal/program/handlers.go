// Package program implements the program.* routes. getProgram / advanceProgram /
// dismissTip / requestLoan / getProgramChapter and the manager/free-agent market
// (browse/interview/sign/release managers, browse/scout/sign players) are real;
// only `tip` remains a declared 400 (the world-service program engine is not
// reachable).
package program

import (
	"context"
	"fmt"
	"net/http"

	"fs-pro-server/internal/auth"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
)

const (
	loanGross = 250000
	loanFee   = 50000
)

type errString string

func (e errString) Error() string { return string(e) }

const errClubNotFound = errString("Club not found")

// Handlers implements the program.* routes.
type Handlers struct {
	repo *Repository
}

// New builds the handler set.
func New(repo *Repository) *Handlers { return &Handlers{repo: repo} }

func stub(what string) httpapi.Response {
	return httpapi.Fail(400, what+" is not available in the Go server yet", nil)
}

func body(cx *httpapi.Context) map[string]any {
	if cx == nil {
		return map[string]any{}
	}
	m, _ := cx.BodyMap()
	if m == nil {
		return map[string]any{}
	}
	return m
}

func floatOf(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int32:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return 0
	}
}

func intOf(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int32:
		return int(n)
	case int64:
		return int(n)
	case float64:
		return int(n)
	case float32:
		return int(n)
	default:
		return 0
	}
}

func boolOf(v any) bool { b, _ := v.(bool); return b }

func intOrNil(v any) any {
	if v == nil {
		return nil
	}
	if n, ok := v.(int); ok {
		return n
	}
	if s, ok := v.(string); ok {
		_ = s
	}
	switch n := v.(type) {
	case int:
		return n
	case int32:
		return int(n)
	case int64:
		return int(n)
	case float64:
		return int(n)
	case float32:
		return int(n)
	default:
		return nil
	}
}

// state builds ProgramState from the persisted OwnerProgram row, mirroring
// owner-program.service.ts's degraded `getProgramState` (the Go engine is not
// reachable, so `reasons` reports it and evaluation fields are zero).
func (h *Handlers) state(ctx context.Context, clubID, reason string) (map[string]any, error) {
	row, err := h.repo.Program(ctx, clubID)
	if err != nil {
		return nil, err
	}
	step := db.StringField(row, "Step")
	if step == "" || step == "not_started" {
		step = "manager"
	}
	stepStars, _ := row["StepStars"].(map[string]any)
	if stepStars == nil {
		stepStars = map[string]any{}
	}
	return map[string]any{
		"clubId":          clubID,
		"step":            step,
		"stepStars":       stepStars,
		"programXp":       intOf(row["ProgramXp"]),
		"startingBalance": floatOf(row["StartingBalance"]),
		"budget":          h.repo.Budget(ctx, clubID),
		"completed":       step == "done",
		"stars":           0,
		"xp":              0,
		"reasons":         reasons(step, reason),
		"advisor":         nil,
		"chapter":         nullableString(row, "Chapter"),
	}, nil
}

func reasons(step, reason string) []string {
	if step == "done" {
		return []string{}
	}
	return []string{reason}
}

// getProgram is GET /api/program/{clubId}. It degrades cleanly when the engine
// is unreachable (Node's getProgramState catch path).
func (h *Handlers) getProgram(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	state, err := h.state(r.Context(), r.PathValue("clubId"), "program engine unavailable")
	if err != nil {
		return httpapi.Fail(404, err.Error(), nil)
	}
	return httpapi.OK("Program state", state)
}

// advanceProgram is POST /api/program/{clubId}/advance: strict, like Node's
// advanceProgram - an engine failure is surfaced as a 400.
func (h *Handlers) advanceProgram(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	if !h.repo.ClubExists(r.Context(), r.PathValue("clubId")) {
		return httpapi.Fail(404, "Club not found", "Club not found")
	}
	return httpapi.Fail(400, "The program engine is unavailable", nil)
}

// dismissTip is POST /api/program/{clubId}/tips/{tipId}/dismiss.
func (h *Handlers) dismissTip(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	clubID := r.PathValue("clubId")
	row, err := h.repo.Program(r.Context(), clubID)
	if err != nil {
		return httpapi.Fail(404, err.Error(), nil)
	}
	tips := stringList(row["DismissedTips"])
	tipID := r.PathValue("tipId")
	if !contains(tips, tipID) {
		tips = append(tips, tipID)
	}
	saved, err := h.repo.SetDismissedTips(r.Context(), clubID, tips)
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	return httpapi.OK("Tip dismissed", map[string]any{"dismissed": saved})
}

// getProgramChapter is GET /api/program/{clubId}/chapter.
func (h *Handlers) getProgramChapter(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	ctx := r.Context()
	clubID := r.PathValue("clubId")
	row, err := h.repo.Program(ctx, clubID)
	if err != nil {
		return httpapi.Fail(404, err.Error(), nil)
	}
	if db.StringField(row, "Step") != "done" {
		return httpapi.OK("Chapter", map[string]any{"chapter": nil, "data": nil, "target": nil, "complete": false})
	}
	chapter := db.StringField(row, "Chapter")
	if chapter == "" {
		chapter = "first_season"
		_ = h.repo.SetChapter(ctx, clubID, chapter)
	}
	return httpapi.OK("Chapter", map[string]any{
		"chapter":  chapter,
		"data":     row["ChapterData"],
		"target":   "Finish in the top half of your pool",
		"complete": false,
	})
}

// requestLoan is POST /api/program/{clubId}/loan: a once-per-year board advance.
func (h *Handlers) requestLoan(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	ctx := r.Context()
	clubID := r.PathValue("clubId")
	if !h.repo.ClubExists(ctx, clubID) {
		return httpapi.Fail(404, "Club not found", "Club not found")
	}
	year := fmt.Sprintf("Y%d", h.repo.CurrentYear(ctx))
	if h.repo.HasBoardAdvance(ctx, clubID, year) {
		return httpapi.Fail(400, "The board has already advanced you funds this year", nil)
	}
	amount := float64(loanGross - loanFee)
	note := fmt.Sprintf("Board advance: %d granted, %d fee", loanGross, loanFee)
	if err := h.repo.GrantBoardAdvance(ctx, clubID, year, amount, note); err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	state, err := h.state(ctx, clubID, "program engine unavailable")
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	return httpapi.OK("Board advance", map[string]any{"granted": true, "amount": amount, "state": state})
}

// --- owner-program market -------------------------------------------------

// browseManagers is GET /api/program/{clubId}/managers.
func (h *Handlers) browseManagers(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	payload, err := BrowseManagers(r.Context(), h.repo.Q(), r.PathValue("clubId"))
	if err != nil {
		return httpapi.Fail(statusFor(err), err.Error(), err.Error())
	}
	return httpapi.OK("Manager market", payload)
}

// interviewManager is POST /api/program/{clubId}/managers/{managerId}/interview.
func (h *Handlers) interviewManager(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	managers, err := InterviewManager(r.Context(), h.repo.Q(), r.PathValue("clubId"), r.PathValue("managerId"))
	if err != nil {
		return httpapi.Fail(statusFor(err), err.Error(), err.Error())
	}
	return httpapi.OK("Manager interviewed", map[string]any{"managers": managers})
}

// signManager is POST /api/program/{clubId}/managers/{managerId}/sign.
func (h *Handlers) signManager(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	ctx := r.Context()
	clubID := r.PathValue("clubId")
	contractYears := 3
	if cy := intOf(body(cx)["contractYears"]); cy > 0 {
		contractYears = cy
	}
	paid, err := SignManager(ctx, h.repo.Q(), clubID, r.PathValue("managerId"), contractYears)
	if err != nil {
		return httpapi.Fail(statusFor(err), err.Error(), err.Error())
	}
	state, serr := h.state(ctx, clubID, "program engine unavailable")
	if serr != nil {
		return httpapi.Fail(statusFor(serr), serr.Error(), serr.Error())
	}
	return httpapi.OK("Manager signed", map[string]any{"state": state, "paid": paid})
}

// releaseManager is POST /api/program/{clubId}/managers/{managerId}/release.
func (h *Handlers) releaseManager(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	ctx := r.Context()
	clubID := r.PathValue("clubId")
	if err := ReleaseManager(ctx, h.repo.Q(), clubID, r.PathValue("managerId")); err != nil {
		return httpapi.Fail(statusFor(err), err.Error(), err.Error())
	}
	state, err := h.state(ctx, clubID, "program engine unavailable")
	if err != nil {
		return httpapi.Fail(statusFor(err), err.Error(), err.Error())
	}
	return httpapi.OK("Manager released", state)
}

// browsePlayers is GET /api/program/{clubId}/players.
func (h *Handlers) browsePlayers(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	payload, err := BrowsePlayers(r.Context(), h.repo.Q(), r.PathValue("clubId"))
	if err != nil {
		return httpapi.Fail(statusFor(err), err.Error(), err.Error())
	}
	return httpapi.OK("Free agents", payload)
}

// scoutPlayer is POST /api/program/{clubId}/players/{playerId}/scout.
func (h *Handlers) scoutPlayer(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	players, err := ScoutPlayer(r.Context(), h.repo.Q(), r.PathValue("clubId"), r.PathValue("playerId"))
	if err != nil {
		return httpapi.Fail(statusFor(err), err.Error(), err.Error())
	}
	return httpapi.OK("Player scouted", map[string]any{"players": players})
}

// signPlayer is POST /api/program/{clubId}/players/{playerId}/sign.
func (h *Handlers) signPlayer(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	ctx := r.Context()
	clubID := r.PathValue("clubId")
	paid, err := SignPlayer(ctx, h.repo.Q(), clubID, r.PathValue("playerId"))
	if err != nil {
		return httpapi.Fail(statusFor(err), err.Error(), err.Error())
	}
	state, serr := h.state(ctx, clubID, "program engine unavailable")
	if serr != nil {
		return httpapi.Fail(statusFor(serr), serr.Error(), serr.Error())
	}
	return httpapi.OK("Player signed", map[string]any{"state": state, "paid": paid})
}

// tip is POST /api/program/{clubId}/tip: engine-backed; the world-service
// program engine is unreachable, so this returns Node's declared 400.
func (h *Handlers) tip(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	body, _ := cx.BodyMap()
	if body == nil {
		body = map[string]any{}
	}
	var events map[string]any
	if e, ok := body["events"].(map[string]any); ok {
		events = e
	}
	advisor := map[string]any{
		"shows": body["shows"], "lastShownAt": body["lastShownAt"],
		"dismissed": body["dismissed"], "quiet": body["quiet"],
	}
	tip, err := h.repo.GetTip(r.Context(), r.PathValue("clubId"), advisor, int64(intOf(body["now"])), events)
	if err != nil {
		return httpapi.Fail(statusFor(err), err.Error(), err.Error())
	}
	return httpapi.OK("Advisor tip", map[string]any{"tip": tip})
}

// statusFor maps a market error to Node's status (404 for not-found, else 400).
func statusFor(err error) int {
	if err == errClubNotFound {
		return 404
	}
	return 400
}

// --- helpers ---------------------------------------------------------------

func (h *Handlers) requireClub(cx *httpapi.Context, r *http.Request) (httpapi.Response, bool) {
	userID := ""
	if cx != nil && cx.Session != nil {
		userID = cx.Session.UserID()
	}
	status, msg := auth.CanManageClub(r.Context(), h.repo.Q(), userID, r.PathValue("clubId"))
	if status != 0 {
		return httpapi.Fail(status, msg, nil), false
	}
	return httpapi.Response{}, true
}

func nullableString(m map[string]any, key string) any {
	if s := db.StringField(m, key); s != "" {
		return s
	}
	return nil
}

func stringList(v any) []string {
	list, ok := v.([]any)
	if !ok {
		return []string{}
	}
	out := make([]string, 0, len(list))
	for _, item := range list {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func contains(list []string, value string) bool {
	for _, s := range list {
		if s == value {
			return true
		}
	}
	return false
}
