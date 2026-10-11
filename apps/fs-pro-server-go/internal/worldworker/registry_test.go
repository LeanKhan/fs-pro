package worldworker

import (
	"context"
	"errors"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

func okJob(context.Context, db.Querier) error { return nil }

func TestRegisterValidates(t *testing.T) {
	reg := NewRegistry(nil, nil)
	if err := reg.Register(Ticker{ID: "a", Interval: time.Second, Job: okJob}); err != nil {
		t.Fatalf("valid register: %v", err)
	}
	if err := reg.Register(Ticker{ID: "a", Interval: time.Second, Job: okJob}); err == nil {
		t.Fatal("duplicate id must be refused")
	}
	if err := reg.Register(Ticker{Interval: time.Second, Job: okJob}); err == nil {
		t.Fatal("empty id must be refused")
	}
	if err := reg.Register(Ticker{ID: "b", Interval: time.Second}); err == nil {
		t.Fatal("nil job must be refused")
	}
	if err := reg.Register(Ticker{ID: "c", Interval: 0, Job: okJob}); err == nil {
		t.Fatal("non-positive interval must be refused")
	}
}

func TestTickersSorted(t *testing.T) {
	reg := NewRegistry(nil, nil)
	for _, id := range []string{"z", "a", "m"} {
		if err := reg.Register(Ticker{ID: id, Interval: time.Second, Job: okJob}); err != nil {
			t.Fatal(err)
		}
	}
	got := reg.Tickers()
	if len(got) != 3 || got[0].ID != "a" || got[1].ID != "m" || got[2].ID != "z" {
		t.Fatalf("tickers not sorted: %+v", got)
	}
}

func TestRunStopsOnContext(t *testing.T) {
	reg := NewRegistry(nil, nil)
	if err := reg.Register(Ticker{ID: "x", Interval: time.Hour, Job: okJob}); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer cancel()
	if err := reg.Run(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("Run err = %v, want DeadlineExceeded (graceful stop)", err)
	}
}

func TestRunEmptyRegistryReturnsContextError(t *testing.T) {
	reg := NewRegistry(nil, nil)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := reg.Run(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("Run err = %v, want Canceled", err)
	}
}
