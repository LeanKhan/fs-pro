// Package db wraps a pgx/v5 connection pool with the world-service defaults:
// a per-call context timeout and structured logging. Placement, hierarchy,
// ranking, pyramid and tile queries all go through Pool so no query can
// outlive its budget (R4/acceptance: "context timeout on every DB call").
//
// The driver choice is pgx/v5's pool: "Package pgxpool is a concurrency-safe
// connection pool for pgx" (pgxpool/doc.go:1), and "New creates a new Pool.
// See [ParseConfig] for information on connString format" (pgxpool/pool.go:203).
// New does not dial Postgres - the puddle pool it builds opens a connection on
// first Acquire (pgxpool/pool.go:203-217, 271) - so the service can start
// before Postgres is ready and report it through /health.
package db

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNoDatabaseURL means the service was started without DATABASE_URL.
var ErrNoDatabaseURL = errors.New("db: DATABASE_URL is required")

// Pool is a pgx pool plus the service-wide query timeout.
type Pool struct {
	pool    *pgxpool.Pool
	timeout time.Duration
	log     *slog.Logger
}

// Querier is the read/write surface the domain packages (placement, ranking,
// pyramid) need. *Pool satisfies it, and tests can inject a fake. Every method
// applies the pool timeout.
type Querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// New parses databaseURL and builds the pool. It does not dial Postgres, so it
// returns an error only for a malformed configuration. A nil logger is
// replaced with slog.Default.
func New(ctx context.Context, databaseURL string, timeout time.Duration, logger *slog.Logger) (*Pool, error) {
	if databaseURL == "" {
		return nil, ErrNoDatabaseURL
	}
	if timeout <= 0 {
		return nil, fmt.Errorf("db: timeout must be positive, got %s", timeout)
	}
	if logger == nil {
		logger = slog.Default()
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("db: parse config: %w", err)
	}
	return &Pool{pool: pool, timeout: timeout, log: logger}, nil
}

// Timeout is the configured per-call budget.
func (p *Pool) Timeout() time.Duration { return p.timeout }

// WithTimeout returns a child of ctx that expires after the pool's timeout.
// Every wrapper below calls it, so callers never pass an unbounded context to
// the driver.
func (p *Pool) WithTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, p.timeout)
}

// Ping checks connectivity within the pool timeout. pgxpool.New is lazy, so
// this is the first real round trip.
func (p *Pool) Ping(ctx context.Context) error {
	ctx, cancel := p.WithTimeout(ctx)
	defer cancel()
	return p.pool.Ping(ctx)
}

// rows wraps a lazy pgx.Rows and cancels the per-call timeout context only
// once iteration is finished. Cancelling in Query (on return) would abort the
// statement before the caller reads it: pgx streams the result set, so the
// context must outlive the returned handle. Next and Close are the two ways
// iteration ends; both release the cancel exactly once.
type timeoutRows struct {
	pgx.Rows
	cancel  context.CancelFunc
	stopped bool
}

// Next advances the result set and releases the timeout when it is exhausted.
func (r *timeoutRows) Next() bool {
	if r.Rows.Next() {
		return true
	}
	r.stop()
	return false
}

// Close closes the result set and releases the timeout early.
func (r *timeoutRows) Close() {
	r.Rows.Close()
	r.stop()
}

func (r *timeoutRows) stop() {
	if !r.stopped {
		r.stopped = true
		r.cancel()
	}
}

// Query runs a query with the pool timeout applied. The returned rows must be
// closed (or fully iterated) by the caller, as with any pgx.Rows.
func (p *Pool) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	ctx, cancel := p.WithTimeout(ctx)
	rows, err := p.pool.Query(ctx, sql, args...)
	if err != nil {
		cancel()
		return nil, err
	}
	return &timeoutRows{Rows: rows, cancel: cancel}, nil
}

// row wraps a lazy pgx.Row and cancels the per-call timeout context after
// Scan runs. Cancelling in QueryRow (on return) would abort the statement
// before the caller scans it. Callers must call Scan, as they do today.
type timeoutRow struct {
	pgx.Row
	cancel context.CancelFunc
}

// Scan scans the row and releases the timeout.
func (r *timeoutRow) Scan(dest ...any) error {
	defer r.cancel()
	return r.Row.Scan(dest...)
}

// QueryRow runs a single-row query with the pool timeout applied.
func (p *Pool) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	ctx, cancel := p.WithTimeout(ctx)
	return &timeoutRow{Row: p.pool.QueryRow(ctx, sql, args...), cancel: cancel}
}

// Exec runs a statement with the pool timeout applied.
func (p *Pool) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	ctx, cancel := p.WithTimeout(ctx)
	defer cancel()
	return p.pool.Exec(ctx, sql, args...)
}

// Close releases every pooled connection. Safe to call once at shutdown.
func (p *Pool) Close() {
	if p == nil || p.pool == nil {
		return
	}
	p.pool.Close()
}
