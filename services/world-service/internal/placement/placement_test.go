package placement

import (
	"context"
	"errors"
	"testing"
)

func TestServiceIsNotImplementedYet(t *testing.T) {
	s := New()
	if _, err := s.Place(context.Background(), Request{CountryID: "c1"}); !errors.Is(err, ErrNotImplemented) {
		t.Fatalf("Place() error = %v, want ErrNotImplemented", err)
	}
	if _, err := s.Children(context.Background(), "c1", "city"); !errors.Is(err, ErrNotImplemented) {
		t.Fatalf("Children() error = %v, want ErrNotImplemented", err)
	}
}
