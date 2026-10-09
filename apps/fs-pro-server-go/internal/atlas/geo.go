package atlas

import (
	"math"
	"regexp"
	"strings"
)

// Literal ports of packages/api-contract/src/world-geo.ts (the atlas constants
// and the name/size helpers).

const (
	atlasW         = 1600
	atlasH         = 900
	atlasMargin    = 70
	regionRing     = 125
	regionRadius   = 70
	countryRadius  = regionRing + regionRadius + 5
	fullAtlasClubs = 600
)

var foundingLimitsCountries = 1
var foundingLimitsTowns = 3
var foundingLimitsClubs = 2

var townTerrains = []string{"city", "coastal", "hillside", "woodland", "alpine"}

type point struct{ x, y float64 }

func dist(a, b point) float64 { return math.Hypot(a.x-b.x, a.y-b.y) }

// atlasSize is the sea that holds every place, with room around the edges.
func atlasSize(points []point) (int, int) {
	w, h := atlasW, atlasH
	for _, p := range points {
		if v := int(math.Ceil(p.x + countryRadius + atlasMargin)); v > w {
			w = v
		}
		if v := int(math.Ceil(p.y + countryRadius + atlasMargin)); v > h {
			h = v
		}
	}
	return w, h
}

func terrainOf(t string) string {
	for _, v := range townTerrains {
		if v == t {
			return t
		}
	}
	return "city"
}

var nameRE = regexp.MustCompile(`^[\p{L}][\p{L}\p{M}0-9 .'&-]*[\p{L}\p{M}0-9.]$`)

// nameProblem ports nameProblem.
func nameProblem(name, what string, min, max int) string {
	n := strings.TrimSpace(name)
	if len([]rune(n)) < min {
		return what + " needs at least " + itoa(min) + " characters"
	}
	if len([]rune(n)) > max {
		return what + " can have at most " + itoa(max) + " characters"
	}
	if !nameRE.MatchString(n) {
		return what + " can only use letters, numbers, spaces and . ' & -"
	}
	if regexp.MustCompile(`\s{2,}`).MatchString(n) {
		return what + " has double spaces"
	}
	return ""
}

// codeProblem ports codeProblem.
func codeProblem(code, what string) string {
	if regexp.MustCompile(`^[A-Z][A-Z0-9]{1,3}$`).MatchString(code) {
		return ""
	}
	return what + " must be 2-4 capital letters or digits"
}

// tidyName ports tidyName.
func tidyName(name string) string {
	return strings.Join(strings.Fields(name), " ")
}

var hexRE = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
var initialsRE = regexp.MustCompile(`^[A-Z0-9]{0,4}$`)

// isCrestDesign approximates @repo/api-contract isCrestDesign: a design object
// with the required string fields and valid hex colours/initials. (The shape/
// pattern/emblem enums are not re-listed; they only affect getAtlas' crest.)
func isCrestDesign(v any) bool {
	d, ok := v.(map[string]any)
	if !ok || d == nil {
		return false
	}
	str := func(k string) (string, bool) { s, ok := d[k].(string); return s, ok }
	primary, ok1 := str("primary")
	secondary, ok2 := str("secondary")
	trim, ok3 := str("trim")
	initials, ok4 := str("initials")
	if !(ok1 && ok2 && ok3 && ok4) {
		return false
	}
	return hexRE.MatchString(primary) && hexRE.MatchString(secondary) && hexRE.MatchString(trim) && initialsRE.MatchString(initials)
}

const (
	countryMinGap = 2*countryRadius + 20
	townMinGap    = 32
)

func inBounds(p point) bool {
	return p.x >= atlasMargin && p.y >= atlasMargin
}

// countrySpotProblem ports countrySpotProblem.
func countrySpotProblem(spot point, countries []point) string {
	if !inBounds(spot) {
		return "Too close to the edge of the world"
	}
	for _, c := range countries {
		if dist(c, spot) < countryMinGap {
			return "Too close to another country"
		}
	}
	return ""
}

// townSpotProblem ports townSpotProblem.
func townSpotProblem(spot, country point, towns, otherCountries []point) string {
	if !inBounds(spot) {
		return "Too close to the edge of the world"
	}
	if dist(spot, country) > countryRadius {
		return "Outside the country"
	}
	for _, c := range otherCountries {
		if dist(c, spot) < dist(country, spot) {
			return "That land belongs to another country"
		}
	}
	for _, t := range towns {
		if dist(t, spot) < townMinGap {
			return "Too close to another town"
		}
	}
	return ""
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}
