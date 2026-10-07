// Package synth generates deterministic synthetic worlds for the D5 scale
// proof: 1,000,000 clubs with the stored fields placement, prominence
// ranking, pyramid assignment and tiling need. The same Config and seed always
// produce the same World, so benchmark numbers are comparable across runs and
// machines.
//
// It deliberately does not use math/rand: the scale proof requires byte-for-
// byte reproducibility, and a tiny self-contained splitmix64 generator makes
// that explicit and independent of the standard library's versioning.
package synth

// DefaultSeed is the fixed seed for the D5 1M-club benchmarks. Change it only
// together with new baseline numbers.
const DefaultSeed int64 = 20260101

// MaxClubs is the top of the D5 scale proof.
const MaxClubs = 1_000_000

// MaxDivision is the deepest pyramid division the generator produces.
const MaxDivision = 10

// Geometry is the synthetic country > region > city > district fan-out (D1).
// The number of districts is Countries*RegionsPerCountry*CitiesPerRegion*
// DistrictsPerCity; clubs are spread evenly over them.
type Geometry struct {
	Countries         int
	RegionsPerCountry int
	CitiesPerRegion   int
	DistrictsPerCity  int
}

// DefaultGeometry is 20 countries, 8 regions each, 8 cities each, 8 districts
// each: 10,240 districts, so 1M clubs sit at roughly 98 per district.
func DefaultGeometry() Geometry {
	return Geometry{
		Countries:         20,
		RegionsPerCountry: 8,
		CitiesPerRegion:   8,
		DistrictsPerCity:  8,
	}
}

// Config is a generation request. Zero fields fall back to the defaults.
type Config struct {
	Seed     int64
	Clubs    int
	Geometry Geometry
}

// DefaultConfig is the D5 benchmark world.
func DefaultConfig() Config {
	return Config{Seed: DefaultSeed, Clubs: MaxClubs, Geometry: DefaultGeometry()}
}

// Club is one synthetic club. Country/Region/City/District are flat indices
// into the generated place tree (0-based); District is the authoritative leaf.
// Division, XP, Fans, Reputation and Elo are the stored fields prominence
// ranking and pool assignment read (Level is derived from XP, never stored).
type Club struct {
	ID         int32
	Country    int32
	Region     int32
	City       int32
	District   int32
	Division   int32
	XP         int32
	Fans       int32
	Reputation int32
	Elo        float64
}

// World is a generated dataset. Counts describe the place tree; Clubs has
// exactly len(Clubs) entries.
type World struct {
	Seed          int64
	Geometry      Geometry
	ClubCount     int
	CountryCount  int
	RegionCount   int
	CityCount     int
	DistrictCount int
	Clubs         []Club
}

// Generate builds a World. It is a pure function of cfg: identical cfg values
// produce identical Worlds.
func Generate(cfg Config) *World {
	if cfg.Seed == 0 {
		cfg.Seed = DefaultSeed
	}
	if cfg.Clubs <= 0 {
		cfg.Clubs = MaxClubs
	}
	geom := withDefaults(cfg.Geometry)

	regionsPerCountry := geom.RegionsPerCountry
	citiesPerCountry := geom.RegionsPerCountry * geom.CitiesPerRegion
	districtsPerCountry := citiesPerCountry * geom.DistrictsPerCity

	districtCount := geom.Countries * districtsPerCountry
	cityCount := geom.Countries * citiesPerCountry
	regionCount := geom.Countries * regionsPerCountry

	rng := newRNG(cfg.Seed)
	clubs := make([]Club, cfg.Clubs)
	for i := range clubs {
		district := i % districtCount
		country := district / districtsPerCountry
		rest := district % districtsPerCountry
		region := country*regionsPerCountry + rest/(geom.CitiesPerRegion*geom.DistrictsPerCity)
		city := country*citiesPerCountry + rest/geom.DistrictsPerCity

		clubs[i] = Club{
			ID:         int32(i),
			Country:    int32(country),
			Region:     int32(region),
			City:       int32(city),
			District:   int32(district),
			Division:   int32(1 + rng.intn(MaxDivision)),
			XP:         int32(1 + rng.intn(1_000_000)),
			Fans:       int32(rng.intn(10_000_000)),
			Reputation: int32(rng.intn(100)),
			Elo:        1000 + rng.float64()*1500,
		}
	}

	return &World{
		Seed:          cfg.Seed,
		Geometry:      geom,
		ClubCount:     len(clubs),
		CountryCount:  geom.Countries,
		RegionCount:   regionCount,
		CityCount:     cityCount,
		DistrictCount: districtCount,
		Clubs:         clubs,
	}
}

func withDefaults(g Geometry) Geometry {
	if g.Countries <= 0 {
		g.Countries = DefaultGeometry().Countries
	}
	if g.RegionsPerCountry <= 0 {
		g.RegionsPerCountry = DefaultGeometry().RegionsPerCountry
	}
	if g.CitiesPerRegion <= 0 {
		g.CitiesPerRegion = DefaultGeometry().CitiesPerRegion
	}
	if g.DistrictsPerCity <= 0 {
		g.DistrictsPerCity = DefaultGeometry().DistrictsPerCity
	}
	return g
}

// rng is splitmix64. next() is the canonical mix; intn and float64 derive from
// it. All methods are deterministic and not safe for concurrent use.
type rng struct{ state uint64 }

func newRNG(seed int64) *rng { return &rng{state: uint64(seed)} }

func (r *rng) next() uint64 {
	r.state += 0x9E3779B97F4A7C15
	z := r.state
	z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9
	z = (z ^ (z >> 27)) * 0x94D049BB133111EB
	return z ^ (z >> 31)
}

func (r *rng) intn(n int) int {
	if n <= 0 {
		return 0
	}
	return int(r.next() % uint64(n))
}

// float64 returns a value in [0, 1) with a 53-bit mantissa.
func (r *rng) float64() float64 {
	return float64(r.next()>>11) / (1 << 53)
}
