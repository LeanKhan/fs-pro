package transfer

import (
	"net/http"

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

func (h *Handlers) purchasePlayer() httpapi.Response      { return stub("Transfer purchases") }
func (h *Handlers) placeBid() httpapi.Response            { return stub("Transfer bids") }
func (h *Handlers) getOffers() httpapi.Response           { return stub("Transfer offers") }
func (h *Handlers) respondToOffer() httpapi.Response      { return stub("Responding to offers") }
func (h *Handlers) listPlayerForSale() httpapi.Response   { return stub("Listing a player for sale") }
func (h *Handlers) scoutPlayerTransfer() httpapi.Response { return stub("Transfer scouting") }
func (h *Handlers) getScoutedShortlist() httpapi.Response { return stub("The scouted shortlist") }
func (h *Handlers) requestBudgetIncrease() httpapi.Response {
	return stub("Budget requests")
}
