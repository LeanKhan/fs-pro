package ranking

import (
	"context"
	"math"
	"strconv"
	"testing"

	"fs-pro-world-service/internal/synth"
)

func almost(a, b float64) bool { return math.Abs(a-b) < 0.005 }

func TestScoreFormula(t *testing.T) {
	tests := []struct {
		name string
		m    Metrics
		want float64
	}{
		{
			name: "world power is 100",
			m:    Metrics{ClubID: "a", Division: 1, XP: 100 * 20 * 20, Elo: 2400, Fans: 1_000_000, Reputation: 100},
			want: 100,
		},
		{
			name: "floor is zero",
			m:    Metrics{ClubID: "b", Division: 99, XP: 0, Elo: 0, Fans: 0, Reputation: 0},
			want: 0,
		},
		{
			// Hand-applied §5.1: eloN .25, lvlN 0, fanN log10(151)/6,
			// repN .05, div .07143 (DIV_MAX).
			name: "new club",
			m:    Metrics{ClubID: "c", XP: 0, Elo: 1500, Fans: 150, Reputation: 5},
			want: 16.23,
		},
		{
			name: "division bonus edges equal Elo",
			m:    Metrics{ClubID: "d", Division: 1, XP: 0, Elo: 1500, Fans: 150, Reputation: 5},
			want: 25.51,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Score(tt.m, nil)
			if !almost(got, tt.want) {
				t.Fatalf("Score() = %.2f, want %.2f", got, tt.want)
			}
		})
	}
}

func TestLevelForXP(t *testing.T) {
	tests := []struct {
		xp   int
		want int
	}{
		{0, 0}, {99, 0}, {100, 1}, {399, 1}, {400, 2}, {10000, 10},
	}
	for _, tt := range tests {
		if got := LevelForXP(tt.xp, nil); got != tt.want {
			t.Errorf("LevelForXP(%d) = %d, want %d", tt.xp, got, tt.want)
		}
	}
}

func TestLevelForXPThresholds(t *testing.T) {
	thresholds := []int{0, 50, 150, 100000}
	tests := []struct{ xp, want int }{
		{0, 0}, {49, 0}, {50, 1}, {149, 1}, {150, 2},
	}
	for _, tt := range tests {
		if got := LevelForXP(tt.xp, thresholds); got != tt.want {
			t.Errorf("LevelForXP(%d, custom) = %d, want %d", tt.xp, got, tt.want)
		}
	}
}

func TestRankTieBreaks(t *testing.T) {
	// Equal prominence is forced with identical metrics except the tie-break
	// field under test.
	base := func(id string) Metrics {
		return Metrics{ClubID: id, XP: 100, Elo: 1500, Fans: 100, Reputation: 10}
	}
	a := base("a") // lower Elo, higher division (worse)
	a.Elo = 1400
	a.Division = 3
	b := base("b")
	b.Elo = 1600
	b.Division = 5

	scored, err := Rank(context.Background(), []Metrics{a, b})
	if err != nil {
		t.Fatalf("Rank error: %v", err)
	}
	if scored[0].ClubID != "b" {
		t.Fatalf("higher Elo should rank first, got %q first", scored[0].ClubID)
	}

	// Same Elo/XP/Fans/Rep: smaller Division wins.
	c := base("c")
	c.Division = 2
	d := base("d")
	d.Division = 7
	scored, _ = Rank(context.Background(), []Metrics{d, c})
	if scored[0].ClubID != "c" {
		t.Fatalf("smaller Division should rank first, got %q", scored[0].ClubID)
	}

	// Full tie: ClubId ascending.
	e, f := base("e"), base("f")
	scored, _ = Rank(context.Background(), []Metrics{f, e})
	if scored[0].ClubID != "e" {
		t.Fatalf("ClubId tie-break should be ascending, got %q", scored[0].ClubID)
	}
}

// BenchmarkRankSynth1M drives the D5 ranking benchmark from the synth
// generator: one million clubs, default seed.
func BenchmarkRankSynth1M(b *testing.B) {
	world := synth.Generate(synth.DefaultConfig())
	metrics := make([]Metrics, len(world.Clubs))
	for i, c := range world.Clubs {
		metrics[i] = Metrics{
			ClubID:     strconv.Itoa(i),
			Division:   int(c.Division),
			XP:         int(c.XP),
			Elo:        c.Elo,
			Fans:       int(c.Fans),
			Reputation: int(c.Reputation),
		}
	}
	ctx := context.Background()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		out, err := RankWithThresholds(ctx, metrics, nil)
		if err != nil {
			b.Fatal(err)
		}
		if len(out) != len(metrics) {
			b.Fatalf("ranked %d, want %d", len(out), len(metrics))
		}
	}
}
