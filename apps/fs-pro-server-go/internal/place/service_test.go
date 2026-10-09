package place

import (
	"context"
	"strings"
	"testing"

	"fs-pro-server/internal/clients"
)

type stubWorld struct {
	card    clients.CardResult
	cards   map[string]clients.EntityCard
	offline bool
}

func (s stubWorld) CanRead() bool { return true }
func (s stubWorld) GetCard(context.Context, string) clients.CardResult {
	return s.card
}
func (s stubWorld) GetCards(context.Context, []string) (map[string]clients.EntityCard, bool) {
	return s.cards, s.offline
}

func TestImportCountryOffline(t *testing.T) {
	svc := NewWorldService(NewRepository(nil), stubWorld{card: clients.CardResult{Status: "offline"}})
	_, err := svc.ImportCountryFromWorld(context.Background(), "e1")
	if err == nil || !strings.Contains(err.Error(), "could not be reached") {
		t.Fatalf("offline import err = %v", err)
	}
}

func TestImportCountryMissing(t *testing.T) {
	svc := NewWorldService(NewRepository(nil), stubWorld{card: clients.CardResult{Status: "missing"}})
	_, err := svc.ImportCountryFromWorld(context.Background(), "e1")
	if err == nil || !strings.Contains(err.Error(), "does not exist") {
		t.Fatalf("missing import err = %v", err)
	}
}

func TestImportCountryNotACountry(t *testing.T) {
	code := "XY"
	svc := NewWorldService(NewRepository(nil), stubWorld{card: clients.CardResult{
		Status: "ok", HasCard: true,
		Card: clients.EntityCard{ID: "e1", Name: "Rivertown", Kind: "city", Code: &code},
	}})
	_, err := svc.ImportCountryFromWorld(context.Background(), "e1")
	if err == nil || !strings.Contains(err.Error(), "not a country") {
		t.Fatalf("wrong kind import err = %v", err)
	}
}

func TestResolveAnchorOfflineReturnsNil(t *testing.T) {
	svc := NewWorldService(NewRepository(nil), stubWorld{card: clients.CardResult{Status: "offline"}})
	anchor, err := svc.ResolveAnchor(context.Background(), "e1")
	if err != nil || anchor != nil {
		t.Fatalf("offline resolve = (%v,%v), want (nil,nil)", anchor, err)
	}
}

func TestStringOrEmpty(t *testing.T) {
	if stringOrEmpty(nil) != "" {
		t.Fatal("nil must be empty")
	}
	s := "x"
	if stringOrEmpty(&s) != "x" {
		t.Fatal("value must pass through")
	}
}
