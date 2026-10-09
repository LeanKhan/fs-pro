// Package program implements the program.* routes. getProgram / advanceProgram /
// dismissTip / requestLoan / getProgramChapter are real; the manager/player
// market writes are declared 400 stubs (pending a port of manager-market.service
// and free-agent-market.service).
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
		"completed":       false,
		"stars":           0,
		"xp":              0,
		"reasons":         []string{reason},
		"advisor":         nil,
		"chapter":         nullableString(row, "Chapter"),
	}, nil
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

// --- not-yet-ported market + engine routes ---------------------------------

func (h *Handlers) tip() httpapi.Response            { return stub("Advisor tips") }
func (h *Handlers) browseManagers() httpapi.Response { return stub("The manager market") }
func (h *Handlers) interviewManager() httpapi.Response {
	return stub("Manager interviews")
}
func (h *Handlers) signManager() httpapi.Response    { return stub("Signing a manager") }
func (h *Handlers) releaseManager() httpapi.Response { return stub("Releasing a manager") }
func (h *Handlers) browsePlayers() httpapi.Response  { return stub("The free-agent market") }
func (h *Handlers) scoutPlayer() httpapi.Response    { return stub("Scouting a player") }
func (h *Handlers) signPlayer() httpapi.Response     { return stub("Signing a player") }

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
