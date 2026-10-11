package play

import (
	"testing"

	"fs-pro-server/internal/grid"
)

// P10 benchmark evidence: grid compile latency. The roadmap's budget is <100 µs
// per compile (pure, alloc-light). `internal/grid` is the implementation; this
// lives in package play, which already depends on it through the raid/match
// request builders, to stay inside the P10 wave's owned files.

// BenchmarkGridCompile times a full 11-slot Compile (the pure grid -> anchors
// step the sim request builders run for every side of every match).
func BenchmarkGridCompile(b *testing.B) {
	g := statGrid("attack")
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if anchors := grid.Compile(g); len(anchors) != grid.Starters {
			b.Fatalf("compile returned %d anchors, want %d", len(anchors), grid.Starters)
		}
	}
}

// BenchmarkGridValidate times the server-authoritative validation that runs on
// every stored/imported layout (tier gates, occupancy, keeper rules).
func BenchmarkGridValidate(b *testing.B) {
	g := statGrid("defend")
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if reason := grid.Validate(g, grid.MaxTier); reason != "" {
			b.Fatalf("validate rejected a legal grid: %s", reason)
		}
	}
}
