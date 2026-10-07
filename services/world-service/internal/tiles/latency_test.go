package tiles

import (
	"context"
	"encoding/json"
	"os"
	"sort"
	"testing"
	"time"

	"fs-pro-world-service/internal/db"
)

// TestTileLatencyPercentiles measures the tile build over every populated cell
// of a scratch world and asserts the Batch 3A budget (§7.4): p95 ≤ 50 ms and
// every payload ≤ 60 KB.
//
//	WORLD_TEST_DATABASE_URL=postgres://fspro:...@localhost:5434/fspro_pyramid_check \
//	  go test ./internal/tiles -run TestTileLatencyPercentiles -v
func TestTileLatencyPercentiles(t *testing.T) {
	url := os.Getenv("WORLD_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set WORLD_TEST_DATABASE_URL to a scratch DB to run this latency test")
	}
	pool, err := db.New(context.Background(), url, 30*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()

	ctx := context.Background()
	keys, err := populatedCells(ctx, pool)
	if err != nil {
		t.Fatalf("populatedCells: %v", err)
	}
	if len(keys) == 0 {
		t.Fatal("no populated cells")
	}

	svc := New(pool)
	samples := make([]time.Duration, 0, len(keys))
	maxBytes := 0
	for _, k := range keys {
		start := time.Now()
		tile, err := svc.Build(ctx, k)
		if err != nil {
			t.Fatalf("Build(%s): %v", k, err)
		}
		samples = append(samples, time.Since(start))
		if b, err := json.Marshal(tile); err == nil && len(b) > maxBytes {
			maxBytes = len(b)
		}
	}
	sort.Slice(samples, func(i, j int) bool { return samples[i] < samples[j] })
	p := func(q float64) time.Duration { return samples[int(float64(len(samples)-1)*q)] }

	t.Logf("cells=%d  p50=%s  p95=%s  p99=%s  max=%s  maxPayload=%d B",
		len(samples), p(0.50), p(0.95), p(0.99), samples[len(samples)-1], maxBytes)

	if p(0.95) > 50*time.Millisecond {
		t.Errorf("p95 = %s, want <= 50 ms", p(0.95))
	}
	if maxBytes > 60*1024 {
		t.Errorf("max payload = %d B, want <= 60 KB", maxBytes)
	}
}

func populatedCells(ctx context.Context, q db.Querier) ([]Key, error) {
	rows, err := q.Query(ctx, `
SELECT DISTINCT z,
       floor(p."MapX" / (256.0 / power(2, z)))::int,
       floor(p."MapY" / (256.0 / power(2, z)))::int
FROM "Places" p
CROSS JOIN generate_series(0, 5) AS z
WHERE p."MapX" IS NOT NULL
ORDER BY 1, 2, 3`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var keys []Key
	for rows.Next() {
		var k Key
		if err := rows.Scan(&k.Z, &k.X, &k.Y); err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	return keys, rows.Err()
}
