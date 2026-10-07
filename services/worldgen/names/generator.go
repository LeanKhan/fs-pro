// Package names generates place-holder character names for the world
// simulator, ported from imagination's internal/names (itself ported from
// the original cmd/names-py Python tool). It is served over HTTP by
// fs-pro's services/worldgen.
package names

import (
	"embed"
	"encoding/json"
	"fmt"
	"math/rand"
	"sort"
	"strings"
	"sync"
)

//go:embed data/misc/name_arrangements.json
var arrangementsFile embed.FS

//go:embed data/name_bank/*.json
var nameBankFS embed.FS

type arrangement struct {
	Firstnames []string `json:"firstnames"`
	Lastnames  []string `json:"lastnames"`
}

var arrangements map[string]arrangement

func init() {
	raw, err := arrangementsFile.ReadFile("data/misc/name_arrangements.json")
	if err != nil {
		panic(fmt.Sprintf("names: reading name_arrangements.json: %v", err))
	}
	if err := json.Unmarshal(raw, &arrangements); err != nil {
		panic(fmt.Sprintf("names: parsing name_arrangements.json: %v", err))
	}
}

type nameBank map[string][]string

var (
	nameBankMu    sync.Mutex
	nameBankCache = map[string]nameBank{}
)

func loadNameBank(culture string) (nameBank, error) {
	nameBankMu.Lock()
	defer nameBankMu.Unlock()

	if bank, ok := nameBankCache[culture]; ok {
		return bank, nil
	}

	raw, err := nameBankFS.ReadFile(fmt.Sprintf("data/name_bank/%s.json", culture))
	if err != nil {
		return nil, fmt.Errorf("names: unknown culture %q", culture)
	}

	var bank nameBank
	if err := json.Unmarshal(raw, &bank); err != nil {
		return nil, fmt.Errorf("names: parsing name bank for %q: %w", culture, err)
	}
	if len(bank) == 0 {
		return nil, fmt.Errorf("names: name bank for %q is empty", culture)
	}

	nameBankCache[culture] = bank
	return bank, nil
}

// ReturnParts selects which piece(s) of the generated name GenerateName returns.
type ReturnParts string

const (
	FirstAndLast ReturnParts = "f_l"
	FirstOnly    ReturnParts = "f"
	LastOnly     ReturnParts = "l"
)

// GenerateName builds a random name for the given culture ("bellean", "kev"),
// composed from a randomly chosen arrangement of name-bank parts (e.g.
// "title__preposition_firstname"), and returns the piece(s) requested by
// returnParts.
func GenerateName(returnParts ReturnParts, culture string) (string, error) {
	arr, ok := arrangements[culture]
	if !ok {
		return "", fmt.Errorf("names: unknown culture %q", culture)
	}

	bank, err := loadNameBank(culture)
	if err != nil {
		return "", err
	}

	firstnameType := arr.Firstnames[rand.Intn(len(arr.Firstnames))]
	lastnameType := arr.Lastnames[rand.Intn(len(arr.Lastnames))]

	firstname, err := buildFromSpec(bank, firstnameType)
	if err != nil {
		return "", err
	}
	lastname, err := buildFromSpec(bank, lastnameType)
	if err != nil {
		return "", err
	}

	switch returnParts {
	case FirstAndLast:
		return firstname + "__" + lastname, nil
	case FirstOnly:
		return firstname, nil
	case LastOnly:
		return lastname, nil
	default:
		return "", fmt.Errorf("names: unknown return parts %q", returnParts)
	}
}

// Cultures returns the cultures this package can generate names for,
// sorted for a stable response (see the /health handler).
func Cultures() []string {
	out := make([]string, 0, len(arrangements))
	for culture := range arrangements {
		out = append(out, culture)
	}
	sort.Strings(out)
	return out
}

func buildFromSpec(bank nameBank, spec string) (string, error) {
	var b strings.Builder
	for _, part := range strings.Split(spec, "_") {
		if part == "" {
			b.WriteString(" ")
			continue
		}
		words, ok := bank[part]
		if !ok || len(words) == 0 {
			return "", fmt.Errorf("names: name part %q not found in name bank", part)
		}
		b.WriteString(words[rand.Intn(len(words))])
	}
	return b.String(), nil
}
