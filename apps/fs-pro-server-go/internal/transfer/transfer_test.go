package transfer

import "testing"

func TestWindowOpen(t *testing.T) {
	closed := 5
	cases := []struct {
		open    bool
		closes  *int
		current int
		want    bool
	}{
		{true, nil, 10, true},
		{false, nil, 10, false},
		{true, &closed, 5, true},
		{true, &closed, 6, false},
	}
	for _, tc := range cases {
		if got := WindowOpen(tc.open, tc.closes, tc.current); got != tc.want {
			t.Fatalf("WindowOpen(%v,%v,%d) = %v, want %v", tc.open, tc.closes, tc.current, got, tc.want)
		}
	}
	state := NewWindowState(true, &closed, 3)
	if state.DaysLeft == nil || *state.DaysLeft != 2 {
		t.Fatalf("daysLeft = %v", state.DaysLeft)
	}
}

func TestPurchaseAffordable(t *testing.T) {
	if ok, _ := PurchaseAffordable(10_000_000, 5_000_000, 4_000_000); !ok {
		t.Fatal("affordable purchase rejected")
	}
	if ok, reason := PurchaseAffordable(10_000_000, 3_000_000, 4_000_000); ok || reason == "" {
		t.Fatal("below-value offer must be rejected")
	}
	if ok, reason := PurchaseAffordable(1_000_000, 5_000_000, 4_000_000); ok || reason == "" {
		t.Fatal("unaffordable offer must be rejected")
	}
}

func TestOfferStateMachine(t *testing.T) {
	if s, ok := NextOfferStatus(OfferPending, "accept"); !ok || s != OfferAccepted {
		t.Fatalf("pending accept = (%s,%v)", s, ok)
	}
	if s, ok := NextOfferStatus(OfferPending, "reject"); !ok || s != OfferRejected {
		t.Fatalf("pending reject = (%s,%v)", s, ok)
	}
	if s, ok := NextOfferStatus(OfferCountered, "accept"); !ok || s != OfferAccepted {
		t.Fatalf("countered accept = (%s,%v)", s, ok)
	}
	if _, ok := NextOfferStatus(OfferAccepted, "accept"); ok {
		t.Fatal("a terminal offer must reject further actions")
	}
	if _, ok := NextOfferStatus(OfferExpired, "reject"); ok {
		t.Fatal("an expired offer must reject further actions")
	}
}
