package clients

import (
	"context"
	"testing"
)

func TestWorldClientUnconfiguredIsOffline(t *testing.T) {
	c := NewWorldClient("")
	if c.CanRead() {
		t.Fatal("empty api url must not be readable")
	}
	if res := c.GetCard(context.Background(), "x"); res.Status != "offline" {
		t.Fatalf("GetCard = %q, want offline", res.Status)
	}
	if _, offline := c.GetCards(context.Background(), []string{"x"}); !offline {
		t.Fatal("GetCards must report offline when unconfigured")
	}
}
