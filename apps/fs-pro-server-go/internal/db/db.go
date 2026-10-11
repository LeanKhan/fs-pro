// Package db wraps a pgx/v5 connection pool with a per-call timeout and
// structured logging, mirroring services/world-service/internal/db. It also
// provides the row->map adapter that reproduces the Node wire shape: column
// names are the contract field names (except the dropped `mongoId`), NULLs
// stay as explicit nulls and timestamps are formatted like JSON.stringify.
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

// ErrNoDatabaseURL means the process was started without DATABASE_URL. The
// HTTP server still starts and reports the database as down.
var ErrNoDatabaseURL = errors.New("db: DATABASE_URL is required")

// Pool is a pgx pool plus the service-wide query timeout.
type Pool struct {
	pool    *pgxpool.Pool
	timeout time.Duration
	log     *slog.Logger
}

// Querier is the small surface the domain stores need. *Pool satisfies it and
// tests can inject a fake.
type Querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// New parses databaseURL and builds the pool. pgxpool.New is lazy: it does not
// dial Postgres, so this only fails for a malformed configuration.
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

// WithTimeout returns a child of ctx that expires after the pool timeout.
func (p *Pool) WithTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, p.timeout)
}

// Ping checks connectivity within the pool timeout.
func (p *Pool) Ping(ctx context.Context) error {
	ctx, cancel := p.WithTimeout(ctx)
	defer cancel()
	return p.pool.Ping(ctx)
}

// Begin starts a transaction, releasing the per-call timeout when it
// commits/rolls back.
func (p *Pool) Begin(ctx context.Context) (pgx.Tx, error) {
	ctx, cancel := p.WithTimeout(ctx)
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		cancel()
		return nil, err
	}
	return &timeoutTx{Tx: tx, cancel: cancel}, nil
}

// timeoutTx releases the per-call timeout on Commit/Rollback.
type timeoutTx struct {
	pgx.Tx
	cancel context.CancelFunc
}

func (t *timeoutTx) Commit(ctx context.Context) error {
	defer t.cancel()
	return t.Tx.Commit(ctx)
}

func (t *timeoutTx) Rollback(ctx context.Context) error {
	defer t.cancel()
	return t.Tx.Rollback(ctx)
}

type timeoutRows struct {
	pgx.Rows
	cancel  context.CancelFunc
	stopped bool
}

func (r *timeoutRows) Next() bool {
	if r.Rows.Next() {
		return true
	}
	r.stop()
	return false
}

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

// Query runs a query with the pool timeout applied. The caller must consume or
// close the returned rows.
func (p *Pool) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	ctx, cancel := p.WithTimeout(ctx)
	rows, err := p.pool.Query(ctx, sql, args...)
	if err != nil {
		cancel()
		return nil, err
	}
	return &timeoutRows{Rows: rows, cancel: cancel}, nil
}

type timeoutRow struct {
	pgx.Row
	cancel context.CancelFunc
}

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
