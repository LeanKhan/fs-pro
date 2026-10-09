package placement

import (
	"testing"
)

func TestSimulateNoOverfill(t *testing.T) {
	tests := []struct {
		name string
		n    int
		cfg  Settings
	}{
		{name: "small", n: 25, cfg: DefaultSettings()},
		{name: "one full district", n: 10, cfg: DefaultSettings()},
		{name: "spills into a second district", n: 11, cfg: DefaultSettings()},
		{name: "small districts", n: 500, cfg: Settings{DistrictClubs: 3, CityDistricts: 2, RegionCities: 4, CountryRegions: 2, MetropolisDistricts: 10}},
		{name: "large", n: 20000, cfg: DefaultSettings()},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := Simulate(tt.n, tt.cfg)
			if res.Placed != tt.n {
				t.Fatalf("placed = %d, want %d", res.Placed, tt.n)
			}
			if res.Overfilled != 0 {
				t.Fatalf("overfilled districts = %d", res.Overfilled)
			}
			if res.MaxFill > tt.cfg.DistrictClubs {
				t.Fatalf("max fill = %d, over cap %d", res.MaxFill, tt.cfg.DistrictClubs)
			}
			if res.Districts == 0 || res.Countries == 0 {
				t.Fatalf("empty growth: %+v", res)
			}
		})
	}
}

func TestSimulateGrowthSpreadsAcrossCountries(t *testing.T) {
	// 5000 clubs at the default 960-ish per country must open several countries.
	res := Simulate(5000, DefaultSettings())
	if res.Countries < 2 {
		t.Fatalf("countries = %d, want several", res.Countries)
	}
	if res.Placed != 5000 {
		t.Fatalf("placed = %d", res.Placed)
	}
}

func TestSuggestCountrySpotKeepsGap(t *testing.T) {
	countries := []Point{{800, 450}}
	spot := suggestCountrySpot(countries)
	if dist(spot, countries[0]) < countryMinGap {
		t.Fatalf("new country at %v is too close to the first (gap %.1f < %.1f)", spot, dist(spot, countries[0]), countryMinGap)
	}
}

// BenchmarkPlacementSynth1M drives the D5 placement benchmark: one million
// clubs placed through the growth rules, asserting no overfill.
func BenchmarkPlacementSynth1M(b *testing.B) {
	cfg := DefaultSettings()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		res := Simulate(1_000_000, cfg)
		if res.Overfilled != 0 {
			b.Fatalf("overfilled %d districts", res.Overfilled)
		}
		if res.Placed != 1_000_000 {
			b.Fatalf("placed %d", res.Placed)
		}
	}
}
