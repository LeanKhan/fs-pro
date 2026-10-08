package names

import (
	"embed"
	"encoding/json"
	"fmt"
	"math/rand"
	"sort"
	"strings"
	"sync"

	"fs-pro-worldgen/internal/namecore"
)

// Data is embedded so the service is a single binary: one JSON file per
// culture describes its phonology, name banks and name patterns, and a
// country file maps a country key to a primary culture and a demographic mix.
//
//go:embed data/cultures/*.json
var cultureFS embed.FS

//go:embed data/misc/country_cultures.json
var countriesFS embed.FS

// Phonology is descriptive only (it documents how the bank was generated);
// generation reads the banks directly.
type Phonology struct {
	Onsets    []string `json:"onsets"`
	Nuclei    []string `json:"nuclei"`
	Codas     []string `json:"codas"`
	Templates []string `json:"templates"`
}

// Culture is one fictional naming culture. Banks are keyed by token name so a
// pattern can reference any list (e.g. "{placewords} {clubwords}").
type Culture struct {
	ID          string              `json:"id"`
	DisplayName string              `json:"displayName"`
	Note        string              `json:"note"`
	Phonology   Phonology           `json:"phonology"`
	Banks       map[string][]string `json:"banks"`
	Patterns    map[string][]string `json:"patterns"`
}

// MixEntry is one weighted culture in a country's demographic mix.
type MixEntry struct {
	Culture string `json:"culture"`
	Weight  int    `json:"weight"`
}

// Country maps a country key to its primary culture, its optional weighted
// mix, and the alternate spellings that resolve to it.
type Country struct {
	Culture string     `json:"culture"`
	Mix     []MixEntry `json:"mix"`
	Aliases []string   `json:"aliases"`
}

type countriesFile struct {
	Countries map[string]Country `json:"countries"`
}

var (
	loadOnce sync.Once
	loadErr  error

	culturesByID   map[string]*Culture
	cultureIDs     []string
	countriesByKey map[string]Country
	countryAliases map[string]string // normalised alias -> country key
	aliasToCulture map[string]string // normalised country/culture alias -> culture id
)

// init fails fast: the culture data is embedded, so a load error is a build
// mistake, not a runtime condition. Callers never have to check "is it loaded".
func init() {
	if err := loadAll(); err != nil {
		panic(err)
	}
}

func loadAll() error {
	loadOnce.Do(func() {
		loadErr = doLoad()
	})
	return loadErr
}

func doLoad() error {
	culturesByID = make(map[string]*Culture)
	entries, err := cultureFS.ReadDir("data/cultures")
	if err != nil {
		return fmt.Errorf("names: reading cultures dir: %w", err)
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		raw, err := cultureFS.ReadFile("data/cultures/" + e.Name())
		if err != nil {
			return fmt.Errorf("names: reading %s: %w", e.Name(), err)
		}
		var c Culture
		if err := json.Unmarshal(raw, &c); err != nil {
			return fmt.Errorf("names: parsing %s: %w", e.Name(), err)
		}
		if c.ID == "" {
			return fmt.Errorf("names: culture %s has no id", e.Name())
		}
		if _, dup := culturesByID[c.ID]; dup {
			return fmt.Errorf("names: duplicate culture id %q", c.ID)
		}
		culturesByID[c.ID] = &c
	}
	if len(culturesByID) == 0 {
		return fmt.Errorf("names: no cultures loaded")
	}
	cultureIDs = make([]string, 0, len(culturesByID))
	for id := range culturesByID {
		cultureIDs = append(cultureIDs, id)
	}
	sort.Strings(cultureIDs)

	raw, err := countriesFS.ReadFile("data/misc/country_cultures.json")
	if err != nil {
		return fmt.Errorf("names: reading country_cultures.json: %w", err)
	}
	var cf countriesFile
	if err := json.Unmarshal(raw, &cf); err != nil {
		return fmt.Errorf("names: parsing country_cultures.json: %w", err)
	}
	countriesByKey = cf.Countries
	countryAliases = make(map[string]string)
	aliasToCulture = make(map[string]string)
	for key, def := range countriesByKey {
		if _, ok := culturesByID[def.Culture]; !ok {
			return fmt.Errorf("names: country %q references unknown culture %q", key, def.Culture)
		}
		aliasToCulture[strings.ToLower(key)] = def.Culture
		for _, a := range def.Aliases {
			n := strings.ToLower(strings.TrimSpace(a))
			if n == "" {
				continue
			}
			countryAliases[n] = key
			aliasToCulture[n] = def.Culture
		}
	}
	for id, c := range culturesByID {
		aliasToCulture[id] = id
		aliasToCulture[strings.ToLower(c.DisplayName)] = id
	}
	// Drop mix entries that reference unknown cultures so a typo can never
	// wedge generation; fall back to the primary culture when a mix empties.
	for key, def := range countriesByKey {
		if len(def.Mix) == 0 {
			continue
		}
		kept := def.Mix[:0]
		for _, m := range def.Mix {
			if _, ok := culturesByID[m.Culture]; ok && m.Weight > 0 {
				kept = append(kept, m)
			}
		}
		def.Mix = kept
		countriesByKey[key] = def
	}
	return nil
}

// Kind is a category of name the generator can produce.
type Kind string

const (
	KindFirst    Kind = "first"
	KindLast     Kind = "last"
	KindFull     Kind = "full"
	KindClub     Kind = "club"
	KindRegion   Kind = "region"
	KindCity     Kind = "city"
	KindDistrict Kind = "district"
	KindStadium  Kind = "stadium"
)

// AllKinds lists every generatable kind, stable order.
var AllKinds = []Kind{KindFirst, KindLast, KindFull, KindClub, KindRegion, KindCity, KindDistrict, KindStadium}

// cultureIDsFor returns the sorted culture ids (used by /health and /cultures).
func cultureIDsFor() []string {
	if err := loadAll(); err != nil {
		return nil
	}
	out := make([]string, len(cultureIDs))
	copy(out, cultureIDs)
	return out
}

// CultureInfo is the public summary served by GET /cultures.
type CultureInfo struct {
	ID          string   `json:"id"`
	DisplayName string   `json:"displayName"`
	Note        string   `json:"note"`
	FirstNames  int      `json:"firstNames"`
	Surnames    int      `json:"surnames"`
	PlaceWords  int      `json:"placeWords"`
	Kinds       []string `json:"kinds"`
}

// CultureInfos summarises every loaded culture, sorted by id.
func CultureInfos() ([]CultureInfo, error) {
	if err := loadAll(); err != nil {
		return nil, err
	}
	out := make([]CultureInfo, 0, len(cultureIDs))
	kinds := make([]string, 0, len(AllKinds))
	for _, k := range AllKinds {
		kinds = append(kinds, string(k))
	}
	for _, id := range cultureIDs {
		c := culturesByID[id]
		ci := CultureInfo{
			ID:          c.ID,
			DisplayName: c.DisplayName,
			Note:        c.Note,
			FirstNames:  len(c.Banks["firstnames"]),
			Surnames:    len(c.Banks["surnames"]),
			PlaceWords:  len(c.Banks["placewords"]),
			Kinds:       kinds,
		}
		out = append(out, ci)
	}
	return out, nil
}

// resolveCulture accepts a culture id, a country key, a country alias, or any
// string containing a culture id (e.g. a full country name), and returns the
// culture id. It errors for a truly unknown culture, preserving the old
// endpoint's 400 behaviour.
func resolveCulture(name string) (string, error) {
	if err := loadAll(); err != nil {
		return "", err
	}
	key := strings.ToLower(strings.TrimSpace(name))
	if key == "" {
		return "", fmt.Errorf("names: culture is required")
	}
	if _, ok := culturesByID[key]; ok {
		return key, nil
	}
	if cid, ok := aliasToCulture[key]; ok {
		return cid, nil
	}
	for _, id := range cultureIDs {
		if strings.Contains(key, id) {
			return id, nil
		}
	}
	return "", fmt.Errorf("names: unknown culture %q", name)
}

func resolveCountry(name string) (Country, bool) {
	if err := loadAll(); err != nil {
		return Country{}, false
	}
	key := strings.ToLower(strings.TrimSpace(name))
	if def, ok := countriesByKey[key]; ok {
		return def, true
	}
	if ck, ok := countryAliases[key]; ok {
		return countriesByKey[ck], true
	}
	return Country{}, false
}

// resolveKind maps the legacy returnParts values onto kinds too ("f_l" ->
// full), so old callers keep working.
func resolveKind(kind Kind) (Kind, error) {
	switch kind {
	case "":
		return KindFull, nil
	case KindFirst, KindLast, KindFull, KindClub, KindRegion, KindCity, KindDistrict, KindStadium:
		return kind, nil
	case "f_l":
		return KindFull, nil
	case "f":
		return KindFirst, nil
	case "l":
		return KindLast, nil
	}
	return "", fmt.Errorf("names: unknown kind %q", kind)
}

func generateOne(c *Culture, kind Kind, r *rand.Rand) (string, error) {
	switch kind {
	case KindFirst:
		return pickWord(c.Banks["firstnames"], r)
	case KindLast:
		return pickWord(c.Banks["surnames"], r)
	case KindFull:
		first, err := pickWord(c.Banks["firstnames"], r)
		if err != nil {
			return "", err
		}
		last, err := pickWord(c.Banks["surnames"], r)
		if err != nil {
			return "", err
		}
		return first + "__" + last, nil
	default:
		patterns := c.Patterns[string(kind)]
		if len(patterns) == 0 {
			return "", fmt.Errorf("names: culture %q has no pattern for kind %q", c.ID, kind)
		}
		return renderPattern(c, patterns[r.Intn(len(patterns))], r), nil
	}
}

func pickWord(words []string, r *rand.Rand) (string, error) {
	if len(words) == 0 {
		return "", fmt.Errorf("names: bank is empty")
	}
	return words[r.Intn(len(words))], nil
}

// renderPattern substitutes every {token} with a random word from the bank
// with that key; unknown tokens render as the empty string.
func renderPattern(c *Culture, pattern string, r *rand.Rand) string {
	var b strings.Builder
	for i := 0; i < len(pattern); {
		if pattern[i] == '{' {
			if j := strings.IndexByte(pattern[i:], '}'); j > 0 {
				token := pattern[i+1 : i+j]
				if words := c.Banks[token]; len(words) > 0 {
					b.WriteString(words[r.Intn(len(words))])
				}
				i += j + 1
				continue
			}
		}
		b.WriteByte(pattern[i])
		i++
	}
	return strings.Join(strings.Fields(b.String()), " ")
}

// GenerateKind returns one name of the given kind for a culture (id, country
// key or alias), deterministically for a given seed.
func GenerateKind(culture string, kind Kind, seed int64) (string, error) {
	cid, err := resolveCulture(culture)
	if err != nil {
		return "", err
	}
	k, err := resolveKind(kind)
	if err != nil {
		return "", err
	}
	r := rand.New(rand.NewSource(seed))
	name, err := generateOne(culturesByID[cid], k, r)
	if err != nil {
		return "", err
	}
	if namecore.Denied(name) {
		// Astronomically unlikely for assembled names, but never serve a
		// real-world collision.
		return GenerateKind(culture, kind, seed+1)
	}
	return name, nil
}

// GenerateBatch samples count names of a kind without enforcing uniqueness.
// It exists so tests (and future tooling) can measure the natural collision
// rate; callers that need distinct names use GenerateUnique.
func GenerateBatch(culture string, kind Kind, seed int64, count int) ([]string, error) {
	cid, err := resolveCulture(culture)
	if err != nil {
		return nil, err
	}
	k, err := resolveKind(kind)
	if err != nil {
		return nil, err
	}
	c := culturesByID[cid]
	r := rand.New(rand.NewSource(seed))
	out := make([]string, 0, count)
	for i := 0; i < count; i++ {
		s, err := generateOne(c, k, r)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, nil
}

// GenerateUnique returns count distinct names. Rejection-samples duplicates
// and, only if a small bank is exhausted, disambiguates with a Roman suffix.
func GenerateUnique(culture string, kind Kind, seed int64, count int) ([]string, error) {
	cid, err := resolveCulture(culture)
	if err != nil {
		return nil, err
	}
	k, err := resolveKind(kind)
	if err != nil {
		return nil, err
	}
	c := culturesByID[cid]
	r := rand.New(rand.NewSource(seed))
	seen := make(map[string]bool, count)
	out := make([]string, 0, count)
	attempts := 0
	maxAttempts := count*40 + 400
	for len(out) < count {
		s, err := generateOne(c, k, r)
		if err != nil {
			return nil, err
		}
		attempts++
		if namecore.Denied(s) {
			continue
		}
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
			continue
		}
		if attempts >= maxAttempts {
			for n := 2; len(out) < count; n++ {
				cand := fmt.Sprintf("%s %s", s, roman(n))
				if !seen[cand] {
					seen[cand] = true
					out = append(out, cand)
				}
			}
		}
	}
	return out, nil
}

// GenerateMixed generates count names for a country using its weighted
// demographic mix. It returns the names and the culture histogram actually
// drawn. A country key with no mix behaves as its primary culture.
func GenerateMixed(country string, kind Kind, seed int64, count int) ([]string, map[string]int, error) {
	def, ok := resolveCountry(country)
	if !ok {
		// Not a known country: fall through to culture handling so a caller
		// passing a culture id still works.
		cid, err := resolveCulture(country)
		if err != nil {
			return nil, nil, err
		}
		def = Country{Culture: cid, Mix: []MixEntry{{Culture: cid, Weight: 1}}}
	}
	k, err := resolveKind(kind)
	if err != nil {
		return nil, nil, err
	}
	mix := def.Mix
	if len(mix) == 0 {
		mix = []MixEntry{{Culture: def.Culture, Weight: 1}}
	}
	r := rand.New(rand.NewSource(seed))
	seen := make(map[string]bool, count)
	out := make([]string, 0, count)
	dist := make(map[string]int)
	attempts := 0
	maxAttempts := count*60 + 600
	for len(out) < count {
		cid := pickMix(mix, r)
		c, ok := culturesByID[cid]
		if !ok {
			continue
		}
		s, err := generateOne(c, k, r)
		if err != nil {
			return nil, nil, err
		}
		attempts++
		if namecore.Denied(s) || seen[s] {
			if attempts >= maxAttempts {
				for n := 2; len(out) < count; n++ {
					cand := fmt.Sprintf("%s %s", s, roman(n))
					if !seen[cand] {
						seen[cand] = true
						out = append(out, cand)
						dist[cid]++
					}
				}
			}
			continue
		}
		seen[s] = true
		out = append(out, s)
		dist[cid]++
	}
	return out, dist, nil
}

func pickMix(mix []MixEntry, r *rand.Rand) string {
	total := 0
	for _, m := range mix {
		total += m.Weight
	}
	if total <= 0 {
		return mix[0].Culture
	}
	n := r.Intn(total)
	for _, m := range mix {
		if n < m.Weight {
			return m.Culture
		}
		n -= m.Weight
	}
	return mix[len(mix)-1].Culture
}

// CultureBankWords returns a copy of one bank for a culture (tests/reports).
func CultureBankWords(culture, bank string) ([]string, error) {
	cid, err := resolveCulture(culture)
	if err != nil {
		return nil, err
	}
	return append([]string(nil), culturesByID[cid].Banks[bank]...), nil
}

// CultureBankLen exposes a bank size for tests and diagnostics.
func CultureBankLen(culture, bank string) (int, error) {
	cid, err := resolveCulture(culture)
	if err != nil {
		return 0, err
	}
	return len(culturesByID[cid].Banks[bank]), nil
}

// CulturePatterns exposes a culture's patterns for tests.
func CulturePatterns(culture string) (map[string][]string, error) {
	cid, err := resolveCulture(culture)
	if err != nil {
		return nil, err
	}
	out := make(map[string][]string, len(culturesByID[cid].Patterns))
	for k, v := range culturesByID[cid].Patterns {
		out[k] = append([]string(nil), v...)
	}
	return out, nil
}

func roman(n int) string {
	vals := []struct {
		v int
		s string
	}{{10, "X"}, {9, "IX"}, {5, "V"}, {4, "IV"}, {1, "I"}}
	var b strings.Builder
	for _, x := range vals {
		for n >= x.v {
			b.WriteString(x.s)
			n -= x.v
		}
	}
	if b.Len() == 0 {
		return "I"
	}
	return b.String()
}
