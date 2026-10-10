package association

import (
	"errors"
	"net/http"
	"time"

	"fs-pro-server/internal/httpapi"
)

// Handlers implements the associations.* routes (05 §3, 02 §G). Every mutation
// is scoped by the route-policy guard to a club the caller manages (a clubId
// body field), and this layer scopes that club to the association's membership.
type Handlers struct {
	repo *Repository
}

// New builds the handler set.
func New(repo *Repository) *Handlers { return &Handlers{repo: repo} }

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

func intField(m map[string]any, key string) (int, bool) {
	switch n := m[key].(type) {
	case float64:
		if n != float64(int(n)) {
			return 0, false
		}
		return int(n), true
	case int:
		return n, true
	case int64:
		return int(n), true
	default:
		return 0, false
	}
}

func floatField(m map[string]any, key string) (float64, bool) {
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

// create is POST /api/associations.
func (h *Handlers) create(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	b := body(cx)
	clubID := str(b, "clubId")
	name := str(b, "name")
	tag := str(b, "tag")
	if clubID == "" || name == "" || tag == "" {
		return httpapi.Fail(400, "clubId, name and tag are required", "clubId, name and tag are required")
	}
	payload, err := h.repo.Create(r.Context(), clubID, name, tag, str(b, "description"), nowUTC())
	if err != nil {
		return mapErr(err)
	}
	return httpapi.OK("Association created", payload)
}

// get is GET /api/associations/{id}.
func (h *Handlers) get(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	payload, ok, err := h.repo.Get(r.Context(), r.PathValue("id"), nowUTC())
	if err != nil {
		return mapErr(err)
	}
	if !ok {
		return httpapi.Fail(404, "Association not found", nil)
	}
	return httpapi.OK("Association", payload)
}

// join is POST /api/associations/{id}/join.
func (h *Handlers) join(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	clubID := str(body(cx), "clubId")
	if clubID == "" {
		return httpapi.Fail(400, "clubId is required", "clubId is required")
	}
	payload, err := h.repo.Join(r.Context(), r.PathValue("id"), clubID, nowUTC())
	if err != nil {
		return mapErr(err)
	}
	return httpapi.OK("Joined association", payload)
}

// leave is POST /api/associations/{id}/leave.
func (h *Handlers) leave(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	clubID := str(body(cx), "clubId")
	if clubID == "" {
		return httpapi.Fail(400, "clubId is required", "clubId is required")
	}
	if err := h.repo.Leave(r.Context(), r.PathValue("id"), clubID, nowUTC()); err != nil {
		return mapErr(err)
	}
	return httpapi.OKNoPayload(200, "Left association")
}

// loan is POST /api/associations/{id}/loans: it moves a player on loan
// (default) or returns one when the body carries action:"return".
func (h *Handlers) loan(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	b := body(cx)
	assocID := r.PathValue("id")
	clubID := str(b, "clubId")
	if clubID == "" {
		return httpapi.Fail(400, "clubId is required", "clubId is required")
	}
	if str(b, "action") == "return" {
		loanID := str(b, "loanId")
		if loanID == "" {
			return httpapi.Fail(400, "loanId is required to return a loan", "loanId is required to return a loan")
		}
		payload, err := h.repo.ReturnLoan(r.Context(), assocID, clubID, loanID, nowUTC())
		if err != nil {
			return mapErr(err)
		}
		return httpapi.OK("Loan returned", payload)
	}
	playerID := str(b, "playerId")
	toClubID := str(b, "toClubId")
	if playerID == "" || toClubID == "" {
		return httpapi.Fail(400, "playerId and toClubId are required", "playerId and toClubId are required")
	}
	hours := 0
	if v, ok := intField(b, "hours"); ok {
		hours = v
	}
	payload, err := h.repo.MoveLoan(r.Context(), assocID, clubID, playerID, toClubID, hours, nowUTC())
	if err != nil {
		return mapErr(err)
	}
	return httpapi.OK("Player loaned", payload)
}

// derby is POST /api/associations/{id}/derby/{derbyId}: it records an attack
// (default) or advances the lifecycle with action:"advance".
func (h *Handlers) derby(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	b := body(cx)
	assocID := r.PathValue("id")
	derbyID := r.PathValue("derbyId")
	if str(b, "action") == "advance" {
		payload, err := h.repo.AdvanceDerby(r.Context(), derbyID, nowUTC())
		if err != nil {
			return mapErr(err)
		}
		return httpapi.OK("Derby advanced", payload)
	}
	clubID := str(b, "clubId")
	defenderClubID := str(b, "defenderClubId")
	stars, okStars := intField(b, "stars")
	destruction, okDestruction := floatField(b, "destruction")
	if clubID == "" || defenderClubID == "" || !okStars || !okDestruction {
		return httpapi.Fail(400, "clubId, defenderClubId, stars and destruction are required", "clubId, defenderClubId, stars and destruction are required")
	}
	payload, err := h.repo.RecordAttempt(r.Context(), derbyID, assocID, clubID, defenderClubID, stars, destruction, nowUTC())
	if err != nil {
		return mapErr(err)
	}
	return httpapi.OK("Derby attempt recorded", payload)
}

// directives is GET /api/associations/{id}/directives.
func (h *Handlers) directives(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	clubID := r.URL.Query().Get("clubId")
	payload, ok, err := h.repo.ListDirectives(r.Context(), r.PathValue("id"), WeeklyKey(nowUTC()), clubID, nowUTC())
	if err != nil {
		return mapErr(err)
	}
	if !ok {
		return httpapi.Fail(404, "Association not found", nil)
	}
	return httpapi.OK("Directives", payload)
}

// claimDirective is POST /api/associations/{id}/directives/{directiveId}/claim.
func (h *Handlers) claimDirective(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	b := body(cx)
	clubID := str(b, "clubId")
	tier, ok := intField(b, "tier")
	if clubID == "" || !ok {
		return httpapi.Fail(400, "clubId and tier are required", "clubId and tier are required")
	}
	payload, err := h.repo.ClaimDirectiveTier(r.Context(), r.PathValue("id"), r.PathValue("directiveId"), clubID, tier, nowUTC())
	if err != nil {
		return mapErr(err)
	}
	return httpapi.OK("Directive reward claimed", payload)
}

// grounds is POST /api/associations/{id}/grounds.
func (h *Handlers) grounds(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	b := body(cx)
	clubID := str(b, "clubId")
	gold, ok := intField(b, "gold")
	if clubID == "" || !ok || gold <= 0 {
		return httpapi.Fail(400, "clubId and a positive gold amount are required", "clubId and a positive gold amount are required")
	}
	payload, err := h.repo.ContributeGrounds(r.Context(), r.PathValue("id"), clubID, gold, nowUTC())
	if err != nil {
		return mapErr(err)
	}
	return httpapi.OK("Grounds contribution accepted", payload)
}

func nowUTC() time.Time { return time.Now().UTC() }

// mapErr maps the association sentinels to the routes' declared statuses.
func mapErr(err error) httpapi.Response {
	msg := err.Error()
	switch {
	case errors.Is(err, ErrAssociationNotFound), errors.Is(err, ErrClubNotFound),
		errors.Is(err, ErrPlayerNotFound), errors.Is(err, ErrLoanNotFound),
		errors.Is(err, ErrDerbyNotFound), errors.Is(err, ErrDirectiveNotFound),
		errors.Is(err, ErrPlayerNotHere):
		return httpapi.Fail(404, msg, msg)
	case errors.Is(err, ErrForbidden), errors.Is(err, ErrNotAMember),
		errors.Is(err, ErrNotParticipant), errors.Is(err, ErrOpponentNotMember):
		return httpapi.Fail(403, msg, msg)
	case errors.Is(err, ErrAlreadyMember), errors.Is(err, ErrMemberCap),
		errors.Is(err, ErrClosed), errors.Is(err, ErrNameTaken),
		errors.Is(err, ErrTagTaken), errors.Is(err, ErrLoanExists),
		errors.Is(err, ErrLoanSlotsFull), errors.Is(err, ErrDerbyComplete),
		errors.Is(err, ErrAttemptsExhausted), errors.Is(err, ErrTierNotReached),
		errors.Is(err, ErrTierAlreadyClaimed), errors.Is(err, ErrInsufficientFunds),
		errors.Is(err, ErrGroundsMaxed):
		return httpapi.Fail(409, msg, msg)
	case errors.Is(err, ErrInvalidInput), errors.Is(err, ErrDerbyNotInBattle):
		return httpapi.Fail(400, msg, msg)
	default:
		return httpapi.Fail(400, msg, msg)
	}
}
