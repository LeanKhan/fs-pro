package pyramid

import (
	"context"
	"fmt"
	"testing"

	"fs-pro-world-service/internal/synth"
)

func TestShapeParity(t *testing.T) {
	tests := []struct {
		name      string
		n         int
		wantClubs []int
		wantPools [][]int // poolClubs per division
	}{
		{
			name:      "100 clubs: D1/10 D2/20 D3/40 D4/30 into 4 pools",
			n:         100,
			wantClubs: []int{10, 20, 40, 30},
			wantPools: [][]int{{10}, {10, 10}, {10, 10, 10, 10}, {8, 8, 7, 7}},
		},
		{
			name:      "10 clubs is one pool",
			n:         10,
			wantClubs: []int{10},
			wantPools: [][]int{{10}},
		},
		{
			name:      "12 clubs: D1 10, D2 2",
			n:         12,
			wantClubs: []int{10, 2},
			wantPools: [][]int{{10}, {2}},
		},
		{
			name:      "0 clubs",
			n:         0,
			wantClubs: []int{0},
			wantPools: [][]int{{0}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Shape(tt.n, 10, 0.8)
			if len(got) != len(tt.wantClubs) {
				t.Fatalf("divisions = %d, want %d", len(got), len(tt.wantClubs))
			}
			for i, d := range got {
				if d.Clubs != tt.wantClubs[i] {
					t.Errorf("division %d clubs = %d, want %d", i+1, d.Clubs, tt.wantClubs[i])
				}
				if len(d.PoolClubs) != len(tt.wantPools[i]) {
					t.Fatalf("division %d pools = %d, want %d", i+1, len(d.PoolClubs), len(tt.wantPools[i]))
				}
				for j, n := range d.PoolClubs {
					if n != tt.wantPools[i][j] {
						t.Errorf("division %d pool %d clubs = %d, want %d", i+1, j, n, tt.wantPools[i][j])
					}
				}
			}
		})
	}
}

func TestShapeInvariants(t *testing.T) {
	for _, n := range []int{1, 9, 11, 30, 100, 500, 10000, 100000} {
		shape := Shape(n, 10, 0.8)
		total := 0
		for _, d := range shape {
			if len(d.PoolSizes) != len(d.PoolClubs) {
				t.Fatalf("n=%d: division %d has %d sizes / %d poolClubs", n, d.Division, len(d.PoolSizes), len(d.PoolClubs))
			}
			sum := 0
			for i, pc := range d.PoolClubs {
				if pc > d.PoolSizes[i] {
					t.Fatalf("n=%d: division %d pool %d over poolSize", n, d.Division, i)
				}
				sum += pc
			}
			if sum != d.Clubs {
				t.Fatalf("n=%d: division %d poolClubs sum %d != clubs %d", n, d.Division, sum, d.Clubs)
			}
			total += d.Clubs
		}
		if total != n {
			t.Fatalf("n=%d: shape sums to %d", n, total)
		}
	}
}

func sampleClubs(n int) []Club {
	clubs := make([]Club, n)
	for i := 0; i < n; i++ {
		region := i / 40
		city := i / 10
		district := i / 4
		clubs[i] = Club{
			ClubID:      fmt.Sprintf("club-%06d", i),
			CountryID:   "c",
			RegionID:    fmt.Sprintf("r-%d", region),
			CityID:      fmt.Sprintf("ci-%d", city),
			DistrictID:  fmt.Sprintf("d-%d", district),
			Division:    i%5 + 1,
			Desired:     i%5 + 1,
			HasDesired:  true,
			Level:       i % 20,
			XP:          i * 100,
			Elo:         1500 + float64(i%400),
			RegionKey:   pad(region),
			CityKey:     pad(city),
			DistrictKey: pad(district),
		}
	}
	return clubs
}

func TestAssignEveryClubExactlyOnce(t *testing.T) {
	clubs := sampleClubs(100)
	got, err := Assign(context.Background(), clubs, Options{})
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]int{}
	for _, p := range got.Pools {
		if len(p.ClubIDs) > DefaultPoolSize {
			t.Fatalf("pool has %d clubs, over poolSize", len(p.ClubIDs))
		}
		for _, id := range p.ClubIDs {
			seen[id]++
		}
	}
	if len(seen) != len(clubs) {
		t.Fatalf("assigned %d distinct clubs, want %d", len(seen), len(clubs))
	}
	for id, n := range seen {
		if n != 1 {
			t.Fatalf("club %s in %d pools", id, n)
		}
	}
	// Division 1 must be a single national pool.
	div1 := 0
	for _, p := range got.Pools {
		if p.Division == 1 {
			div1++
		}
	}
	if div1 != 1 {
		t.Fatalf("division 1 has %d pools, want 1", div1)
	}
}

func TestAssignLocalityOrdering(t *testing.T) {
	clubs := sampleClubs(400)
	got, err := Assign(context.Background(), clubs, Options{})
	if err != nil {
		t.Fatal(err)
	}
	byDivision := map[int][]string{}
	for _, p := range got.Pools {
		byDivision[p.Division] = append(byDivision[p.Division], p.ClubIDs...)
	}
	keyOf := map[string]string{}
	for _, c := range clubs {
		keyOf[c.ClubID] = c.RegionKey + c.CityKey + c.DistrictKey + c.ClubID
	}
	divisions := Shape(len(clubs), DefaultPoolSize, DefaultBottomFill)
	for di, d := range divisions {
		if di == len(divisions)-1 {
			continue // bottom is power-banded, not globally locality-sorted
		}
		var prev string
		for _, id := range byDivision[d.Division] {
			k := keyOf[id]
			if prev != "" && k < prev {
				t.Fatalf("division %d locality out of order: %q before %q", d.Division, prev, k)
			}
			prev = k
		}
	}
}

func TestAssignNewClubsLandInBottomDivision(t *testing.T) {
	clubs := sampleClubs(200)
	bottom := Shape(len(clubs), DefaultPoolSize, DefaultBottomFill)
	bottomDiv := bottom[len(bottom)-1].Division
	for i := 40; i < 80; i++ { // a slice of brand-new clubs
		clubs[i].HasDesired = false
		clubs[i].Desired = 0
		clubs[i].Level = 0
		clubs[i].XP = 0
	}
	got, err := Assign(context.Background(), clubs, Options{})
	if err != nil {
		t.Fatal(err)
	}
	newIDs := map[string]bool{}
	for i := 40; i < 80; i++ {
		newIDs[clubs[i].ClubID] = true
	}
	for _, p := range got.Pools {
		for _, id := range p.ClubIDs {
			if newIDs[id] && p.Division != bottomDiv {
				t.Fatalf("new club %s landed in division %d, want bottom %d", id, p.Division, bottomDiv)
			}
		}
	}
}

// BenchmarkAssignSynth1M drives the D5 pool-assignment benchmark from the
// synth generator: one million clubs.
func BenchmarkAssignSynth1M(b *testing.B) {
	world := synth.Generate(synth.DefaultConfig())
	clubs := make([]Club, len(world.Clubs))
	for i, c := range world.Clubs {
		clubs[i] = Club{
			ClubID:      fmt.Sprintf("club-%07d", i),
			CountryID:   fmt.Sprintf("c-%d", c.Country),
			RegionID:    fmt.Sprintf("r-%d", c.Region),
			CityID:      fmt.Sprintf("ci-%d", c.City),
			DistrictID:  fmt.Sprintf("d-%d", c.District),
			Division:    int(c.Division),
			Desired:     int(c.Division),
			HasDesired:  true,
			XP:          int(c.XP),
			Elo:         c.Elo,
			RegionKey:   pad(int(c.Region)),
			CityKey:     pad(int(c.City)),
			DistrictKey: pad(int(c.District)),
		}
	}
	ctx := context.Background()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		got, err := Assign(ctx, clubs, Options{})
		if err != nil {
			b.Fatal(err)
		}
		if len(got.Pools) == 0 {
			b.Fatal("no pools")
		}
	}
}
