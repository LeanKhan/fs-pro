package synth

import (
	"reflect"
	"testing"
)

func smallConfig(seed int64, clubs int) Config {
	return Config{
		Seed:     seed,
		Clubs:    clubs,
		Geometry: Geometry{Countries: 2, RegionsPerCountry: 3, CitiesPerRegion: 4, DistrictsPerCity: 5},
	}
}

func TestGenerateIsDeterministic(t *testing.T) {
	cfg := smallConfig(42, 5000)

	a := Generate(cfg)
	b := Generate(cfg)
	if !reflect.DeepEqual(a, b) {
		t.Fatal("Generate with the same seed produced different worlds")
	}

	c := Generate(smallConfig(43, 5000))
	if reflect.DeepEqual(a, c) {
		t.Fatal("Generate with a different seed produced the same world")
	}
}

func TestGeneratePrefixIsStable(t *testing.T) {
	// Growing the club count must not perturb earlier clubs: the generator is
	// a prefix-stable stream. Batch 2 relies on this to scale benchmarks up
	// without changing their first N clubs.
	small := Generate(smallConfig(DefaultSeed, 1000))
	large := Generate(smallConfig(DefaultSeed, 250000))
	if len(small.Clubs) != 1000 {
		t.Fatalf("small world has %d clubs, want 1000", len(small.Clubs))
	}
	if !reflect.DeepEqual(small.Clubs, large.Clubs[:1000]) {
		t.Fatal("first 1000 clubs differ between a 1k and a 250k world")
	}
}

func TestGenerateDefaultsAndCounts(t *testing.T) {
	w := Generate(Config{}) // all zero => D5 defaults
	if w.ClubCount != MaxClubs {
		t.Fatalf("ClubCount = %d, want %d", w.ClubCount, MaxClubs)
	}
	if len(w.Clubs) != MaxClubs {
		t.Fatalf("len(Clubs) = %d, want %d", len(w.Clubs), MaxClubs)
	}
	geom := DefaultGeometry()
	if w.DistrictCount != geom.Countries*geom.RegionsPerCountry*geom.CitiesPerRegion*geom.DistrictsPerCity {
		t.Fatalf("DistrictCount = %d", w.DistrictCount)
	}
	if w.Seed != DefaultSeed {
		t.Fatalf("Seed = %d, want %d", w.Seed, DefaultSeed)
	}
}

func TestGenerateClubFieldsInRange(t *testing.T) {
	geom := Geometry{Countries: 2, RegionsPerCountry: 3, CitiesPerRegion: 4, DistrictsPerCity: 5}
	w := Generate(Config{Seed: 7, Clubs: 10000, Geometry: geom})

	for i, c := range w.Clubs {
		if c.ID != int32(i) {
			t.Fatalf("club %d: ID = %d", i, c.ID)
		}
		if c.Country < 0 || c.Country >= int32(geom.Countries) {
			t.Fatalf("club %d: Country = %d out of range", i, c.Country)
		}
		if c.Region < 0 || c.Region >= int32(w.RegionCount) {
			t.Fatalf("club %d: Region = %d out of range", i, c.Region)
		}
		if c.City < 0 || c.City >= int32(w.CityCount) {
			t.Fatalf("club %d: City = %d out of range", i, c.City)
		}
		if c.District < 0 || c.District >= int32(w.DistrictCount) {
			t.Fatalf("club %d: District = %d out of range", i, c.District)
		}
		if c.Division < 1 || c.Division > MaxDivision {
			t.Fatalf("club %d: Division = %d out of range", i, c.Division)
		}
		if c.XP < 1 {
			t.Fatalf("club %d: XP = %d", i, c.XP)
		}
		if c.Fans < 0 {
			t.Fatalf("club %d: Fans = %d", i, c.Fans)
		}
		if c.Reputation < 0 || c.Reputation >= 100 {
			t.Fatalf("club %d: Reputation = %d", i, c.Reputation)
		}
		if c.Elo < 1000 || c.Elo >= 2500 {
			t.Fatalf("club %d: Elo = %f", i, c.Elo)
		}
	}
}

func TestGenerateRoundRobinDistricts(t *testing.T) {
	// Each district must receive clubs; with 2*3*4*5 = 120 districts and 1000
	// clubs every district is used.
	w := Generate(smallConfig(1, 1000))
	perDistrict := make(map[int32]int, w.DistrictCount)
	for _, c := range w.Clubs {
		perDistrict[c.District]++
	}
	if len(perDistrict) != w.DistrictCount {
		t.Fatalf("used districts = %d, want %d", len(perDistrict), w.DistrictCount)
	}
}

// BenchmarkGenerate1M is the D5 synth benchmark: a full 1,000,000-club world.
func BenchmarkGenerate1M(b *testing.B) {
	cfg := DefaultConfig()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		w := Generate(cfg)
		if len(w.Clubs) != MaxClubs {
			b.Fatalf("generated %d clubs, want %d", len(w.Clubs), MaxClubs)
		}
	}
}
