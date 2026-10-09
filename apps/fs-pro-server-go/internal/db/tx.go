package db

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// Beginner is implemented by *Pool: a Querier that can start a transaction.
type Beginner interface {
	Begin(ctx context.Context) (pgx.Tx, error)
}

// WithTx runs fn inside a transaction, committing on success and rolling back
// on error. The transaction satisfies Querier, so repository code runs
// unchanged against it.
func WithTx(ctx context.Context, q Querier, fn func(tx Querier) error) error {
	if _, ok := q.(pgx.Tx); ok {
		// Already inside a transaction: run directly, no nested begin.
		return fn(q)
	}
	b, ok := q.(Beginner)
	if !ok {
		return errors.New("db: transactions are not supported by this querier")
	}
	tx, err := b.Begin(ctx)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback(ctx)
		return err
	}
	return tx.Commit(ctx)
}

// InRollback runs fn inside a transaction that is always rolled back. For
// read-only assertions in tests that exercise write paths without leaving data
// changed.
func InRollback(ctx context.Context, q Querier, fn func(tx Querier) error) error {
	if _, ok := q.(pgx.Tx); ok {
		return fn(q)
	}
	b, ok := q.(Beginner)
	if !ok {
		return errors.New("db: transactions are not supported by this querier")
	}
	tx, err := b.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	return fn(tx)
}
