package worldworker

import (
	"context"
	"io"
	"log/slog"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/play"
)

// P10 benchmark evidence: worker tick latency. The roadmap's budget is <50 ms
// per tick. The registry's per-tick fixed cost is a transaction + a
// transaction-scoped advisory lock + the job; the defense sweep is the heaviest
// recurring job. Both are measured against the scratch DB (DATABASE_URL).

func benchPool(b *testing.B) (*db.Pool, context.Context) {
	b.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		b.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := db.New(ctx, url, 15*time.Second, nil)
	if err != nil {
		b.Fatalf("db.New: %v", err)
	}
	b.Cleanup(pool.Close)
	return pool, ctx
}

// BenchmarkWorkerTickOverhead times the registry's fixed per-tick cost (begin +
// advisory lock + commit) with a no-op job, so it is the floor every ticker
// pays regardless of workload.
func BenchmarkWorkerTickOverhead(b *testing.B) {
	pool, ctx := benchPool(b)
	reg := NewRegistry(pool, slog.New(slog.NewTextHandler(io.Discard, nil)))
	t := Ticker{
		ID: "bench", Interval: time.Second, LockKey: 0x50544553, // "PTES"
		Job: func(context.Context, db.Querier) error { return nil },
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		reg.tick(ctx, t)
	}
}

// BenchmarkDefenseSweepTick times the offline defense-resolution tick on an
// empty queue (the common case): the indexed pending scan plus its transaction.
func BenchmarkDefenseSweepTick(b *testing.B) {
	pool, ctx := benchPool(b)
	now := time.Now().UTC()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := play.ResolvePendingRaids(ctx, pool, now, nil, play.DefaultDefenseBatch); err != nil {
			b.Fatalf("defense sweep: %v", err)
		}
	}
}

// BenchmarkExpireShieldsTick times the Rest Window -> Warm-up Guard sweep.
func BenchmarkExpireShieldsTick(b *testing.B) {
	pool, ctx := benchPool(b)
	now := time.Now().UTC()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := play.ExpireShields(ctx, pool, now); err != nil {
			b.Fatalf("shield sweep: %v", err)
		}
	}
}
