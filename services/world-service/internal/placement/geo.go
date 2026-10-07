// Geometry helpers for new places, ported from packages/api-contract
// world-geo.ts so the world-service can place a new district/city/region
// country on the atlas without asking Node (WORLD-HIERARCHY-SPEC §3.5/§4.2).
// The golden-angle spirals keep places apart; the coordinates match the
// client's suggest* helpers' shape (atlas units).
package placement

import "math"

const (
	atlasW        = 1600.0
	atlasH        = 900.0
	atlasMargin   = 70.0
	regionRing    = 125.0
	regionRadius  = 70.0
	countryRadius = regionRing + regionRadius + 5
	countryMinGap = 2*countryRadius + 20
	townMinGap    = 32.0
)

// golden is the golden angle (not a constant: math.Sqrt is not const-evaluable).
var golden = math.Pi * (3 - math.Sqrt(5))

// Point is an atlas coordinate.
type Point struct {
	X float64
	Y float64
}

func dist(a, b Point) float64 { return math.Hypot(a.X-b.X, a.Y-b.Y) }

func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }

func inBounds(p Point) bool {
	return finite(p.X) && finite(p.Y) && p.X >= atlasMargin && p.Y >= atlasMargin
}

// spotProblem reports why `spot` is not a free leaf place, or nil.
func spotProblem(spot, country Point, towns, otherCountries []Point) error {
	if !inBounds(spot) {
		return errSpotEdge
	}
	if dist(spot, country) > countryRadius {
		return errSpotOutside
	}
	for _, c := range otherCountries {
		if dist(c, spot) < dist(country, spot) {
			return errSpotOther
		}
	}
	for _, t := range towns {
		if dist(t, spot) < townMinGap {
			return errSpotNear
		}
	}
	return nil
}

var (
	errSpotEdge    = errSpot("too close to the edge of the world")
	errSpotOutside = errSpot("outside the country")
	errSpotOther   = errSpot("that land belongs to another country")
	errSpotNear    = errSpot("too close to another place")
)

type errSpot string

func (e errSpot) Error() string { return string(e) }

// suggestTownSpot walks a golden-angle spiral out from `centre` (a region or a
// city) for a free district/city point. `seed` shifts the spiral.
func suggestTownSpot(country, centre Point, towns, otherCountries []Point, seed int, radius float64) (Point, bool) {
	start := 6.0
	if centre == country {
		start = 34.0
	}
	for i := 0; i < 240; i++ {
		r := start + 11*math.Sqrt(float64(i))
		if r > radius {
			break
		}
		a := float64(i+seed) * golden
		spot := Point{math.Round(centre.X + r*math.Cos(a)), math.Round(centre.Y + r*math.Sin(a))}
		if spotProblem(spot, country, towns, otherCountries) == nil {
			return spot, true
		}
	}
	return Point{}, false
}

// suggestRegionSpot finds a free region centre on the ring around `country`.
func suggestRegionSpot(country Point, regions, otherCountries []Point, seed float64) (Point, bool) {
	const slots = 6
	for k := 0; k < slots*2; k++ {
		offset := 0.0
		if k >= slots {
			offset = 0.5
		}
		a := (float64(k%slots)+offset)*(2*math.Pi/float64(slots)) + seed
		spot := Point{math.Round(country.X + regionRing*math.Cos(a)), math.Round(country.Y + regionRing*math.Sin(a))}
		if !inBounds(spot) {
			continue
		}
		nearRegion := false
		for _, r := range regions {
			if dist(r, spot) < regionRadius*1.5 {
				nearRegion = true
				break
			}
		}
		if nearRegion {
			continue
		}
		nearerOther := false
		for _, c := range otherCountries {
			if dist(c, spot) < dist(country, spot) {
				nearerOther = true
				break
			}
		}
		if nearerOther {
			continue
		}
		return spot, true
	}
	return Point{}, false
}

// suggestCountrySpot finds the first golden-angle spot that keeps every
// country COUNTRY_MIN_GAP away.
func suggestCountrySpot(countries []Point) Point {
	centre := Point{atlasW / 2, atlasH / 2}
	edge := atlasMargin + countryRadius
	for i := 0; i < 1_000_000; i++ {
		r := 60 * math.Sqrt(float64(i))
		a := float64(i) * golden
		spot := Point{math.Round(centre.X + r*math.Cos(a)), math.Round(centre.Y + r*math.Sin(a))}
		if spot.X < edge || spot.Y < edge {
			continue
		}
		ok := true
		for _, c := range countries {
			if dist(c, spot) < countryMinGap {
				ok = false
				break
			}
		}
		if ok {
			return spot
		}
	}
	return centre
}
