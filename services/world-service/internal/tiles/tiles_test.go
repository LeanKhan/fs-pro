package tiles

import (
	"context"
	"errors"
	"testing"
)

func TestServiceIsNotImplementedYet(t *testing.T) {
	s := New()
	_, err := s.Build(context.Background(), Key{Z: 3, X: 1, Y: 2})
	if !errors.Is(err, ErrNotImplemented) {
		t.Fatalf("Build() error = %v, want ErrNotImplemented", err)
	}
}
