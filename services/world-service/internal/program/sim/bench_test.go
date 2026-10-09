package sim

import "testing"

func BenchmarkSimulate1000(b *testing.B) {
	req := Request{Balance: 3_000_000, Strategy: string(BalancedExpert), Runs: 1000, Seed: 1}
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		if _, err := Run(req); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkRunOne(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_ = runOne(3_000_000, BalancedExpert, newRand(7, i))
	}
}
