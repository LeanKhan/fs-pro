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

// Query runs a query with the pool timeout applied.
func (p *Pool) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	ctx, cancel := p.WithTimeout(ctx)
	defer cancel()
	return p.pool.Query(ctx, sql, args...)
}

// QueryRow runs a single-row query with the pool timeout applied.
func (p *Pool) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	ctx, cancel := p.WithTimeout(ctx)
	defer cancel()
	return p.pool.QueryRow(ctx, sql, args...)
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
