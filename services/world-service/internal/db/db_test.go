package db

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestNewValidates(t *testing.T) {
	tests := []struct {
		name    string
		url     string
		timeout time.Duration
		wantErr error
	}{
		{name: "empty url", url: "", timeout: time.Second, wantErr: ErrNoDatabaseURL},
		{name: "zero timeout", url: "postgres://u:p@127.0.0.1:5432/db", timeout: 0},
		{name: "negative timeout", url: "postgres://u:p@127.0.0.1:5432/db", timeout: -time.Second},
		{name: "valid", url: "postgres://u:p@127.0.0.1:5432/db", timeout: 2 * time.Second},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pool, err := New(context.Background(), tt.url, tt.timeout, nil)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("New() error = %v, want %v", err, tt.wantErr)
				}
				return
			}
			if tt.timeout <= 0 {
				if err == nil {
					t.Fatal("New() with non-positive timeout: want error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("New() unexpected error: %v", err)
			}
			defer pool.Close()
			if got := pool.Timeout(); got != tt.timeout {
				t.Fatalf("Timeout() = %s, want %s", got, tt.timeout)
			}
		})
	}
}

func TestWithTimeout(t *testing.T) {
	pool := &Pool{timeout: 50 * time.Millisecond}

	ctx, cancel := pool.WithTimeout(context.Background())
	defer cancel()

	if _, ok := ctx.Deadline(); !ok {
		t.Fatal("WithTimeout returned a context without a deadline")
	}
	select {
	case <-ctx.Done():
		t.Fatal("context expired before the timeout")
	case <-time.After(10 * time.Millisecond):
	}

	select {
	case <-ctx.Done():
	case <-time.After(time.Second):
		t.Fatal("context did not expire after the timeout")
	}
}

func TestCloseOnNilPool(t *testing.T) {
	// Close is called from a defer in main; a nil receiver must not panic.
	(*Pool)(nil).Close()
}
