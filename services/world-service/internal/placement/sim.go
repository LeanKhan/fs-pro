// In-memory placement simulation for the D5 1M-club benchmark. It applies the
// same rules as the DB engine (holes first, then grow the frontier country:
// fewest-districts city, then a new city, region, country) over abstract
// counters so the benchmark measures the algorithm, not Postgres.
package placement

// SimResult summarises a simulated world.
type SimResult struct {
	Placed     int
	Districts  int
	Cities     int
	Regions    int
	Countries  int
	MaxFill    int
	Overfilled int
}

type simCity struct {
	districts int
	region    int
}

type simRegion struct {
	cities  int
	country int
}

type simCountry struct {
	regions     int
	capital     int
	cityStart   int
	regionStart int
}

type simState struct {
	cfg       Settings
	fills     []int
	cities    []simCity
	regions   []simRegion
	countries []simCountry
	hole      int
}

func (st *simState) openDistrict(city int) int {
	st.fills = append(st.fills, 0)
	st.cities[city].districts++
	return len(st.fills) - 1
}

func (st *simState) openCity(country, region int) int {
	st.cities = append(st.cities, simCity{region: region})
	ci := len(st.cities) - 1
	st.regions[region].cities++
	if st.countries[country].capital < 0 {
		st.countries[country].capital = ci
	}
	return ci
}

func (st *simState) openRegion(country int) int {
	st.regions = append(st.regions, simRegion{country: country})
	r := len(st.regions) - 1
	st.countries[country].regions++
	return r
}

func (st *simState) openCountry() int {
	st.countries = append(st.countries, simCountry{
		capital:     -1,
		cityStart:   len(st.cities),
		regionStart: len(st.regions),
	})
	c := len(st.countries) - 1
	r := st.openRegion(c)
	st.openCity(c, r)
	return c
}

// Simulate places n clubs into a growing world and returns its shape.
func Simulate(n int, cfg Settings) SimResult {
	if cfg.DistrictClubs <= 0 {
		cfg = DefaultSettings()
	}
	st := &simState{cfg: cfg, fills: make([]int, 0, n/4+16)}
	st.openCountry()

	placed := 0
	for i := 0; i < n; i++ {
		for st.hole < len(st.fills) && st.fills[st.hole] >= cfg.DistrictClubs {
			st.hole++
		}
		if st.hole < len(st.fills) {
			st.fills[st.hole]++
			placed++
			continue
		}

		cIdx := len(st.countries) - 1
		country := &st.countries[cIdx]

		// Fewest-districts city below its cap, newest on ties.
		best := -1
		bestDistricts := 1 << 30
		for ci := country.cityStart; ci < len(st.cities); ci++ {
			limit := cfg.CityDistricts
			if ci == country.capital {
				limit = cfg.MetropolisDistricts
			}
			d := st.cities[ci].districts
			if d >= limit {
				continue
			}
			if d <= bestDistricts {
				best = ci
				bestDistricts = d
			}
		}
		if best >= 0 {
			st.fills[st.openDistrict(best)]++
			placed++
			continue
		}

		// A new city in the newest region that has room.
		newCity := -1
		for ri := len(st.regions) - 1; ri >= country.regionStart; ri-- {
			if st.regions[ri].cities < cfg.RegionCities {
				newCity = ri
				break
			}
		}
		if newCity >= 0 {
			ci := st.openCity(cIdx, newCity)
			st.fills[st.openDistrict(ci)]++
			placed++
			continue
		}

		// A new region, else a new country.
		if country.regions < cfg.CountryRegions {
			ri := st.openRegion(cIdx)
			ci := st.openCity(cIdx, ri)
			st.fills[st.openDistrict(ci)]++
			placed++
			continue
		}
		cIdx = st.openCountry()
		st.fills[st.openDistrict(st.countries[cIdx].capital)]++
		placed++
	}

	res := SimResult{
		Placed:    placed,
		Districts: len(st.fills),
		Cities:    len(st.cities),
		Regions:   len(st.regions),
		Countries: len(st.countries),
	}
	for _, f := range st.fills {
		if f > res.MaxFill {
			res.MaxFill = f
		}
		if f > cfg.DistrictClubs {
			res.Overfilled++
		}
	}
	return res
}
