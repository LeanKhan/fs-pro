// Package namecore holds the pure, dependency-free pieces of worldgen's
// culture naming: phonotactic syllable assembly and the real-name deny-list.
//
// It deliberately has no embed/init side effects so it can be imported by the
// offline bank generator (cmd/genbanks) as well as the runtime names package.
// The runtime loads the generated culture JSON; the generator writes it.
package namecore

import (
	"math/rand"
	"strings"
	"unicode"
)

// Phonotactics describes how a culture assembles syllables into a name.
//
// A template is a short string over three letters: 'O' (onset), 'V' (nucleus)
// and 'K' (coda). For example "OVK" is a closed consonant-vowel-consonant
// syllable and "OV" is an open one. Assembling a name picks a template per
// syllable and fills each slot from the corresponding pool.
type Phonotactics struct {
	Onsets    []string `json:"onsets"`
	Nuclei    []string `json:"nuclei"`
	Codas     []string `json:"codas"`
	Templates []string `json:"templates"`
}

// Capitalize upper-cases the first rune of s, leaving the rest untouched.
func Capitalize(s string) string {
	if s == "" {
		return s
	}
	r := []rune(s)
	r[0] = unicode.ToUpper(r[0])
	return string(r)
}

// Assemble builds one name of between minSyl and maxSyl syllables, at most
// maxNameLen characters, with the first letter capitalised.
func Assemble(r *rand.Rand, p Phonotactics, minSyl, maxSyl, maxNameLen int) string {
	if minSyl < 1 {
		minSyl = 1
	}
	if maxSyl < minSyl {
		maxSyl = minSyl
	}
	if len(p.Templates) == 0 {
		return ""
	}
	n := minSyl
	if maxSyl > minSyl {
		n = minSyl + r.Intn(maxSyl-minSyl+1)
	}
	var b strings.Builder
	lastConsonant := false
	for i := 0; i < n; i++ {
		tpl := p.Templates[r.Intn(len(p.Templates))]
		for _, c := range tpl {
			switch c {
			case 'O':
				s := pickOnset(r, p.Onsets, lastConsonant)
				b.WriteString(s)
				lastConsonant = s != "" && isConsonant(lastRune(s))
			case 'V':
				b.WriteString(pick(r, p.Nuclei))
				lastConsonant = false
			case 'K':
				s := pick(r, p.Codas)
				b.WriteString(s)
				lastConsonant = s != ""
			}
		}
	}
	s := b.String()
	if maxNameLen > 0 && len(s) > maxNameLen {
		s = s[:maxNameLen]
	}
	return Capitalize(s)
}

// pickOnset avoids a consonant cluster at a syllable boundary: after a closed
// syllable it prefers a single-letter onset so names read as CV-CVC rather
// than CVCCCV.
func pickOnset(r *rand.Rand, onsets []string, lastConsonant bool) string {
	if !lastConsonant {
		return pick(r, onsets)
	}
	for i := 0; i < 12; i++ {
		s := pick(r, onsets)
		if len(s) == 1 {
			return s
		}
	}
	for _, s := range onsets {
		if len(s) == 1 {
			return s
		}
	}
	return pick(r, onsets)
}

func isConsonant(r rune) bool {
	switch r {
	case 'a', 'e', 'i', 'o', 'u', 'y':
		return false
	default:
		return true
	}
}

func lastRune(s string) rune {
	r := []rune(s)
	if len(r) == 0 {
		return 0
	}
	return r[len(r)-1]
}

func pick(r *rand.Rand, xs []string) string {
	if len(xs) == 0 {
		return ""
	}
	return xs[r.Intn(len(xs))]
}
