package ranking

import (
	"context"
	"errors"
	"testing"
)

func TestServiceIsNotImplementedYet(t *testing.T) {
	s := New()
	_, err := s.Rank(context.Background(), []Metrics{{ClubID: "a", Elo: 1500}})
	if !errors.Is(err, ErrNotImplemented) {
		t.Fatalf("Rank() error = %v, want ErrNotImplemented", err)
	}
}
