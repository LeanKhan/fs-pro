package transfer

import (
	"context"
	"net/http"
	"strings"

	"fs-pro-server/internal/auth"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
)

// Handlers implements the transfers.* routes.
type Handlers struct {
	repo *Repository
}

// New builds the handler set.
func New(repo *Repository) *Handlers { return &Handlers{repo: repo} }

func stub(what string) httpapi.Response {
	return httpapi.Fail(400, what+" is not available in the Go server yet", nil)
}

// getTransferWindow is GET /api/transfers/window.
func (h *Handlers) getTransferWindow(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	state, err := h.repo.Window(r.Context())
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	return httpapi.OK("Transfer window", state)
}

// setTransferWindow is POST /api/transfers/window.
func (h *Handlers) setTransferWindow(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	body, _ := cx.BodyMap()
	open, _ := body["open"].(bool)
	var days *int
	if v, ok := asInt(body["days"]); ok && v > 0 {
		days = &v
	}
	state, err := h.repo.SetWindow(r.Context(), open, days)
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	return httpapi.OK("Transfer window updated", state)
}

// purchasePlayer is POST /api/transfers/purchase.
func (h *Handlers) purchasePlayer(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r, "buyingClubId"); !ok {
		return denial
	}
	body, _ := cx.BodyMap()
	if body == nil {
		body = map[string]any{}
	}
	result, err := h.repo.ExecutePurchase(r.Context(), str(body, "playerId"), str(body, "buyingClubId"), floatOf(body["offerAmount"]))
	if err != nil {
		return httpapi.Fail(statusFor(err), err.Error(), err.Error())
	}
	payload := map[string]any{
		"player":      result["player"],
		"buyingClub":  result["buyingClub"],
		"sellingClub": result["sellingClub"],
		"amount":      floatOf(body["offerAmount"]),
	}
	return httpapi.OK("Player purchased successfully!", payload)
}

// placeBid is POST /api/transfers/bids.
func (h *Handlers) placeBid(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r, "biddingClubId"); !ok {
		return denial
	}
	ctx := r.Context()
	body, _ := cx.BodyMap()
	if body == nil {
		body = map[string]any{}
	}
	clubID := str(body, "biddingClubId")
	offerID, err := h.repo.PlaceBid(ctx, str(body, "playerId"), clubID, floatOf(body["amount"]))
	if err != nil {
		return httpapi.Fail(statusFor(err), err.Error(), err.Error())
	}
	offers, err := h.repo.ListOffers(ctx, clubID, 40, 0, false)
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	return httpapi.OK("Bid placed", findOffer(offers, offerID))
}

// getOffers is GET /api/transfers/offers.
func (h *Handlers) getOffers(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	q := r.URL.Query()
	clubID := q.Get("clubId")
	if denial, ok := h.requireClubParam(r.Context(), cx, clubID); !ok {
		return denial
	}
	limit := 40
	if v := q.Get("limit"); v != "" {
		limit = atoiOr(v, 40)
	}
	offset := 0
	if v := q.Get("offset"); v != "" {
		offset = atoiOr(v, 0)
	}
	currentSeasonOnly := q.Get("currentSeasonOnly") == "true"
	offers, err := h.repo.ListOffers(r.Context(), clubID, limit, offset, currentSeasonOnly)
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	return httpapi.OK("Offers fetched", offers)
}

// respondToOffer is POST /api/transfers/offers/{id}/respond.
func (h *Handlers) respondToOffer(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r, "clubId"); !ok {
		return denial
	}
	ctx := r.Context()
	body, _ := cx.BodyMap()
	if body == nil {
		body = map[string]any{}
	}
	clubID := str(body, "clubId")
	action := str(body, "action")
	offerID, err := h.repo.RespondToOffer(ctx, r.PathValue("id"), clubID, action)
	if err != nil {
		return httpapi.Fail(statusFor(err), err.Error(), err.Error())
	}
	offers, err := h.repo.ListOffers(ctx, clubID, 40, 0, false)
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	message := "Offer declined"
	if action == "accept" {
		message = "Offer accepted"
	}
	return httpapi.OK(message, findOffer(offers, offerID))
}

// getScoutedShortlist is GET /api/transfers/scouted-shortlist/{clubId}. Public
// in Node (no route-policy entry -> default GET public, D24).
func (h *Handlers) getScoutedShortlist(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	shortlist, err := h.repo.ScoutedShortlist(r.Context(), r.PathValue("clubId"))
	if err != nil {
		return httpapi.Fail(statusFor(err), err.Error(), err.Error())
	}
	return httpapi.OK("Scouted shortlist loaded", shortlist)
}

// listPlayerForSale is POST /api/transfers/list.
func (h *Handlers) listPlayerForSale(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r, "clubId"); !ok {
		return denial
	}
	body, _ := cx.BodyMap()
	if body == nil {
		body = map[string]any{}
	}
	isListed, _ := body["isListed"].(bool)
	var asking *float64
	if v, ok := body["askingPrice"].(float64); ok && v > 0 {
		asking = &v
	}
	result, err := h.repo.ListPlayerForSale(r.Context(), str(body, "playerId"), str(body, "clubId"), isListed, asking)
	if err != nil {
		return httpapi.Fail(statusFor(err), err.Error(), err.Error())
	}
	message := "Player unlisted"
	if isListed {
		message = "Player listed for sale"
	}
	return httpapi.OK(message, result)
}

// scoutPlayerTransfer is POST /api/transfers/scout.
func (h *Handlers) scoutPlayerTransfer(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r, "clubId"); !ok {
		return denial
	}
	body, _ := cx.BodyMap()
	if body == nil {
		body = map[string]any{}
	}
	report, err := h.repo.ScoutPlayerTransfer(r.Context(), str(body, "playerId"), str(body, "clubId"))
	if err != nil {
		return httpapi.Fail(statusFor(err), err.Error(), err.Error())
	}
	return httpapi.OK("Player transfer scouted successfully", report)
}

// requestBudgetIncrease is POST /api/transfers/budget-request.
func (h *Handlers) requestBudgetIncrease(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r, "clubId"); !ok {
		return denial
	}
	body, _ := cx.BodyMap()
	if body == nil {
		body = map[string]any{}
	}
	result, err := h.repo.RequestBudgetIncrease(r.Context(), str(body, "clubId"), floatOf(body["amount"]), str(body, "justification"))
	if err != nil {
		return httpapi.Fail(statusFor(err), err.Error(), err.Error())
	}
	message := "Board declined your budget increase request"
	switch result["status"] {
	case "ACCEPTED":
		message = "Board approved your budget increase request in full"
	case "COMPROMISE":
		message = "Board approved a partial budget increase"
	}
	return httpapi.OK(message, result)
}

// --- access + helpers ------------------------------------------------------

// requireClub enforces owner/admin for the club id in the given body field.
func (h *Handlers) requireClub(cx *httpapi.Context, r *http.Request, bodyField string) (httpapi.Response, bool) {
	clubID := ""
	if body, ok := cx.BodyMap(); ok {
		clubID = str(body, bodyField)
	}
	return h.requireClubParam(r.Context(), cx, clubID)
}

// requireClubParam enforces owner/admin for an explicit club id (path or query).
func (h *Handlers) requireClubParam(ctx context.Context, cx *httpapi.Context, clubID string) (httpapi.Response, bool) {
	userID := ""
	if cx != nil && cx.Session != nil {
		userID = cx.Session.UserID()
	}
	status, msg := auth.CanManageClub(ctx, h.repo.Q(), userID, clubID)
	if status != 0 {
		return httpapi.Fail(status, msg, nil), false
	}
	return httpapi.Response{}, true
}

func findOffer(offers []map[string]any, id string) map[string]any {
	for _, o := range offers {
		if db.StringField(o, "id") == id {
			return o
		}
	}
	return nil
}

func str(m map[string]any, key string) string { return db.StringField(m, key) }

func atoiOr(v string, fallback int) int {
	n := 0
	if v == "" {
		return fallback
	}
	for _, c := range v {
		if c < '0' || c > '9' {
			return fallback
		}
		n = n*10 + int(c-'0')
	}
	return n
}

func statusFor(err error) int {
	if err != nil && strings.Contains(strings.ToLower(err.Error()), "not found") {
		return 404
	}
	return 400
}
