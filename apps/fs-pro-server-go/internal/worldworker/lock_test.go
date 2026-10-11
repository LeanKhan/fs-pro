package worldworker

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type fakeRow struct {
	value bool
	err   error
}

func (r fakeRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	if len(dest) > 0 {
		if p, ok := dest[0].(*bool); ok {
			*p = r.value
		}
	}
	return nil
}

type fakeQuerier struct {
	sql   string
	args  []any
	value bool
	err   error
}

func (f *fakeQuerier) Query(context.Context, string, ...any) (pgx.Rows, error) { return nil, nil }
func (f *fakeQuerier) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	f.sql = sql
	f.args = args
	return fakeRow{value: f.value, err: f.err}
}
func (f *fakeQuerier) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}

func TestTryAdvisoryLock(t *testing.T) {
	q := &fakeQuerier{value: true}
	got, err := TryAdvisoryLock(context.Background(), q, LockBuilders)
	if err != nil {
		t.Fatalf("TryAdvisoryLock: %v", err)
	}
	if !got {
		t.Fatal("expected acquired")
	}
	if !strings.Contains(q.sql, "pg_try_advisory_lock") {
		t.Fatalf("sql = %q, want pg_try_advisory_lock", q.sql)
	}
	if len(q.args) != 1 || q.args[0] != LockBuilders {
		t.Fatalf("args = %v, want the lock key", q.args)
	}

	busy := &fakeQuerier{value: false}
	if got, err := TryAdvisoryLock(context.Background(), busy, LockBuilders); err != nil || got {
		t.Fatalf("busy lock = %v, %v; want false, nil", got, err)
	}
}

func TestTryAdvisoryLockError(t *testing.T) {
	sentinel := errors.New("boom")
	q := &fakeQuerier{err: sentinel}
	if _, err := TryAdvisoryLock(context.Background(), q, 1); !errors.Is(err, sentinel) {
		t.Fatalf("err = %v, want wrapped sentinel", err)
	}
}

func TestAdvisoryUnlock(t *testing.T) {
	q := &fakeQuerier{value: true}
	ok, err := AdvisoryUnlock(context.Background(), q, LockBuilders)
	if err != nil || !ok {
		t.Fatalf("AdvisoryUnlock = %v, %v", ok, err)
	}
	if !strings.Contains(q.sql, "pg_advisory_unlock") {
		t.Fatalf("sql = %q, want pg_advisory_unlock", q.sql)
	}
}

func TestTryAdvisoryXactLock(t *testing.T) {
	q := &fakeQuerier{value: true}
	ok, err := TryAdvisoryXactLock(context.Background(), q, LockBuilders)
	if err != nil || !ok {
		t.Fatalf("TryAdvisoryXactLock = %v, %v", ok, err)
	}
	if !strings.Contains(q.sql, "pg_try_advisory_xact_lock") {
		t.Fatalf("sql = %q, want pg_try_advisory_xact_lock", q.sql)
	}
}
