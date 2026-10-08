// Package names generates deterministic, culture-keyed names for the world:
// people (players, managers, advisors), clubs, regions, cities, districts and
// stadiums. Cultures are data (services/worldgen/names/data/cultures); the
// generator is the same for every culture and never contains per-culture code.
//
// The package is served over HTTP by fs-pro's services/worldgen.
package names

import (
	"math/rand"
)

// ReturnParts selects which piece(s) of a generated person name GenerateName
// returns. It is kept for the original /names/generate contract: the double
// underscore is the caller's split marker.
type ReturnParts string

const (
	FirstAndLast ReturnParts = "f_l"
	FirstOnly    ReturnParts = "f"
	LastOnly     ReturnParts = "l"
)

// GenerateName builds a random person name for the given culture and returns
// the piece(s) requested by returnParts. The culture may be a culture id
// ("karsh"), a country key ("bellean") or a country alias.
//
// It is the backwards-compatible entry point; callers that need a stable,
// reproducible name should use GenerateKind with an explicit seed.
func GenerateName(returnParts ReturnParts, culture string) (string, error) {
	return GenerateKind(culture, Kind(returnParts), rand.Int63())
}

// Cultures returns the cultures this package can generate names for, sorted
// for a stable response (see the /health handler).
func Cultures() []string {
	return cultureIDsFor()
}
