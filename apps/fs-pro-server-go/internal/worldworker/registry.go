package worldworker

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"sync"
	"time"

	"fs-pro-server/internal/db"
)

// Job is one unit of periodic work. It runs inside the registry's per-tick
// transaction, after the ticker's advisory lock has been acquired, so it may
// safely read and write through the supplied tx.
type Job func(ctx context.Context, tx db.Querier) error

// Ticker is a named job, how often it runs, and the advisory lock that makes it
// safe to run on several instances.
type Ticker struct {
	ID       string
	Interval time.Duration
	LockKey  int64
	Job      Job
}

// Registry owns a process's tickers and runs them until its context is done.
type Registry struct {
	q       db.Querier
	logger  *slog.Logger
	tickers []Ticker
}

// NewRegistry builds an empty registry over a querier.
func NewRegistry(q db.Querier, logger *slog.Logger) *Registry {
	if logger == nil {
		logger = slog.Default()
	}
	return &Registry{q: q, logger: logger}
}

// Register adds a ticker. Duplicate ids and invalid intervals are refused so a
// misconfigured daemon fails at startup rather than silently doing nothing.
func (r *Registry) Register(t Ticker) error {
	if t.ID == "" {
		return fmt.Errorf("worldworker: ticker id is required")
	}
	if t.Job == nil {
		return fmt.Errorf("worldworker: ticker %q has no job", t.ID)
	}
	if t.Interval <= 0 {
		return fmt.Errorf("worldworker: ticker %q needs a positive interval", t.ID)
	}
	for _, existing := range r.tickers {
		if existing.ID == t.ID {
			return fmt.Errorf("worldworker: duplicate ticker %q", t.ID)
		}
	}
	r.tickers = append(r.tickers, t)
	return nil
}

// Tickers returns the registered tickers sorted by id, for the dry-run listing.
func (r *Registry) Tickers() []Ticker {
	out := make([]Ticker, len(r.tickers))
	copy(out, r.tickers)
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// Run starts every ticker and blocks until ctx is cancelled, then waits for the
// in-flight ticks to finish (graceful shutdown). It returns ctx.Err().
func (r *Registry) Run(ctx context.Context) error {
	var wg sync.WaitGroup
	for _, t := range r.tickers {
		wg.Add(1)
		go func(t Ticker) {
			defer wg.Done()
			r.loop(ctx, t)
		}(t)
	}
	<-ctx.Done()
	wg.Wait()
	return ctx.Err()
}

func (r *Registry) loop(ctx context.Context, t Ticker) {
	ticker := time.NewTicker(t.Interval)
	defer ticker.Stop()
	r.tick(ctx, t)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.tick(ctx, t)
		}
	}
}

// tick runs one job under the ticker's transaction-scoped advisory lock. When
// the lock is held elsewhere the tick is skipped (another instance is doing it).
func (r *Registry) tick(ctx context.Context, t Ticker) {
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		acquired, err := TryAdvisoryXactLock(ctx, tx, t.LockKey)
		if err != nil {
			return err
		}
		if !acquired {
			return nil
		}
		tickCounter(t.ID).Inc()
		return t.Job(ctx, tx)
	})
	if err != nil && ctx.Err() == nil {
		tickErrorCounter(t.ID).Inc()
		r.logger.Error("ticker failed", "id", t.ID, "err", err)
	}
}
