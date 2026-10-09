// Package transfer implements the transfers.* routes. The transfer window is
// real; the negotiation/AI/Jev endpoints are declared stubs. The window gate,
// purchase affordability and the offer state machine are ported as pure
// functions so they are testable without a DB.
package transfer

// WindowState is the transfer-window view.
type WindowState struct {
	Open       bool `json:"open"`
	ClosesDay  *int `json:"closesDay"`
	CurrentDay int  `json:"currentDay"`
	DaysLeft   *int `json:"daysLeft"`
}

// WindowOpen reports whether transfers are allowed on currentDay.
func WindowOpen(open bool, closesDay *int, currentDay int) bool {
	if !open {
		return false
	}
	if closesDay == nil {
		return true
	}
	return currentDay <= *closesDay
}

// Window builds the window view.
func NewWindowState(open bool, closesDay *int, currentDay int) WindowState {
	var daysLeft *int
	if closesDay != nil {
		d := *closesDay - currentDay
		if d < 0 {
			d = 0
		}
		daysLeft = &d
	}
	return WindowState{Open: WindowOpen(open, closesDay, currentDay), ClosesDay: closesDay, CurrentDay: currentDay, DaysLeft: daysLeft}
}

// PurchaseAffordable mirrors the MVP purchase preconditions: the offer must be
// at least the player's Value and the buying club's Budget must cover it.
func PurchaseAffordable(budget, offer, value float64) (bool, string) {
	if offer < value {
		return false, "Your offer is below the player's value"
	}
	if budget < offer {
		return false, "Your club cannot afford that offer"
	}
	return true, ""
}

// Offer status values.
const (
	OfferPending   = "pending"
	OfferCountered = "countered"
	OfferAccepted  = "accepted"
	OfferRejected  = "rejected"
	OfferExpired   = "expired"
	OfferFailed    = "failed"
)

// NextOfferStatus advances a bid's state machine for accept/reject. ok=false
// means the action is not allowed from the current status.
func NextOfferStatus(status, action string) (string, bool) {
	switch status {
	case OfferPending:
		if action == "accept" {
			return OfferAccepted, true
		}
		if action == "reject" {
			return OfferRejected, true
		}
	case OfferCountered:
		if action == "accept" {
			return OfferAccepted, true
		}
		if action == "reject" {
			return OfferRejected, true
		}
	}
	return status, false
}
