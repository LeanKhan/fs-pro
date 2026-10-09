package transfer

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the 10 transfers.* routes.
func Register(s *httpapi.Server, h *Handlers) {
	wrap := func(fn func() httpapi.Response) httpapi.Handler {
		return func(*httpapi.Context, http.ResponseWriter, *http.Request) httpapi.Response { return fn() }
	}
	s.Register("transfers.purchasePlayer", http.MethodPost, "/api/transfers/purchase", []int{200, 400, 404}, wrap(h.purchasePlayer))
	s.Register("transfers.getTransferWindow", http.MethodGet, "/api/transfers/window", []int{200, 400}, h.getTransferWindow)
	s.Register("transfers.setTransferWindow", http.MethodPost, "/api/transfers/window", []int{200, 400}, h.setTransferWindow)
	s.Register("transfers.placeBid", http.MethodPost, "/api/transfers/bids", []int{200, 400, 404}, wrap(h.placeBid))
	s.Register("transfers.getOffers", http.MethodGet, "/api/transfers/offers", []int{200, 400}, wrap(h.getOffers))
	s.Register("transfers.respondToOffer", http.MethodPost, "/api/transfers/offers/{id}/respond", []int{200, 400, 404}, wrap(h.respondToOffer))
	s.Register("transfers.listPlayerForSale", http.MethodPost, "/api/transfers/list", []int{200, 400, 404}, wrap(h.listPlayerForSale))
	s.Register("transfers.scoutPlayerTransfer", http.MethodPost, "/api/transfers/scout", []int{200, 400, 404}, wrap(h.scoutPlayerTransfer))
	s.Register("transfers.getScoutedShortlist", http.MethodGet, "/api/transfers/scouted-shortlist/{clubId}", []int{200, 404}, wrap(h.getScoutedShortlist))
	s.Register("transfers.requestBudgetIncrease", http.MethodPost, "/api/transfers/budget-request", []int{200, 400, 404}, wrap(h.requestBudgetIncrease))
}
