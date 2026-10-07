package pyramid

import (
	"context"
	"errors"
	"testing"
)

func TestServiceIsNotImplementedYet(t *testing.T) {
	s := New()
	_, err := s.Assign(context.Background(), []Club{{ClubID: "a", CountryID: "c"}}, Options{PoolSize: 10})
	if !errors.Is(err, ErrNotImplemented) {
		t.Fatalf("Assign() error = %v, want ErrNotImplemented", err)
	}
}
