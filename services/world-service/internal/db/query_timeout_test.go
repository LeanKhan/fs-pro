package db

import (
	"context"
	"os"
	"testing"
	"time"
)

// Regression test for the B2-2C finding: Pool.Query used to call
// `defer cancel()` and then return the lazy pgx.Rows. The cancel fired the
// instant Query returned, so iterating the rows (or calling Scan on a
// QueryRow) failed with "context canceled". Row-iterating endpoints such as
// POST /pyramid/draw and POST /pyramid/join returned 500.
//
// Gated on WORLD_TEST_DATABASE_URL so plain `go test ./...` stays hermetic:
//
//	WORLD_TEST_DATABASE_URL=postgres://fspro:...@localhost:5434/fspro_b2c \
//	  go test ./internal/db -run TestQuerySurvivesTimeout -v
func TestQuerySurvivesTimeout(t *testing.T) {
	url := os.Getenv("WORLD_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set WORLD_TEST_DATABASE_URL to a scratch DB to run this integration test")
	}

	pool, err := New(context.Background(), url, 5*time.Second, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer pool.Close()

	ctx := context.Background()

	// The regression is data-size dependent. pgx streams a result set, and it
	// buffers whatever fits in the first socket read before Query returns: a
	// result small enough to arrive in one read is consumed even when the
	// per-call context was cancelled on return. The pre-fix code (`defer
	// cancel()` in Query) only breaks once iteration has to wait for more
	// bytes than that first read. On the pre-fix code this 500,000-row result
	// fails with "context canceled" at row ~1089; the fix keeps the context
	// alive until the rows are exhausted, so the whole set is consumable.
	t.Run("large Query result is fully consumable after return", func(t *testing.T) {
		const want = 500000
		rows, err := pool.Query(ctx, `SELECT generate_series(1, $1)`, want)
		if err != nil {
			t.Fatalf("Query: %v", err)
		}
		defer rows.Close()

		got := 0
		for rows.Next() {
			var v int
			if err := rows.Scan(&v); err != nil {
				t.Fatalf("Scan at row %d: %v", got+1, err)
			}
			got++
		}
		if err := rows.Err(); err != nil {
			t.Fatalf("rows.Err after %d rows (want %d): %v", got, want, err)
		}
		if got != want {
			t.Fatalf("got %d rows, want %d", got, want)
		}
	})

	t.Run("QueryRow is scannable after return", func(t *testing.T) {
		var v int
		if err := pool.QueryRow(ctx, `SELECT 42`).Scan(&v); err != nil {
			t.Fatalf("QueryRow.Scan: %v", err)
		}
		if v != 42 {
			t.Fatalf("got %d, want 42", v)
		}
	})

	// A query that is still executing when Query returns is the case that
	// breaks if the per-call context is cancelled on return: the context
	// watcher aborts the in-flight statement and Next/Scan returns
	// "context canceled". Sleep keeps the statement in flight.
	t.Run("in-flight Query is not cancelled before consumption", func(t *testing.T) {
		rows, err := pool.Query(ctx, `SELECT 1 FROM (SELECT pg_sleep(0.3)) s`)
		if err != nil {
			t.Fatalf("Query: %v", err)
		}
		defer rows.Close()

		n := 0
		for rows.Next() {
			var v any
			if err := rows.Scan(&v); err != nil {
				t.Fatalf("Scan of an in-flight query: %v", err)
			}
			n++
		}
		if err := rows.Err(); err != nil {
			t.Fatalf("rows.Err of an in-flight query: %v", err)
		}
		if n != 1 {
			t.Fatalf("got %d rows, want 1", n)
		}
	})

	t.Run("in-flight QueryRow is not cancelled before Scan", func(t *testing.T) {
		var v any
		if err := pool.QueryRow(ctx, `SELECT 1 FROM (SELECT pg_sleep(0.3)) s`).Scan(&v); err != nil {
			t.Fatalf("QueryRow.Scan of an in-flight query: %v", err)
		}
	})
}
