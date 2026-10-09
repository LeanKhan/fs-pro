package names

import (
	"fmt"
	"strings"
	"testing"

	"fs-pro-worldgen/internal/namecore"
)

// The eight starting cultures required by the brief (six from STARTER plus
// the two invented extensions).
var expectedCultures = []string{
	"karsh", "kev", "legardio", "hunterlaan", "inga", "kiyoto", "pregge", "proland",
}

func TestAllExpectedCulturesLoad(t *testing.T) {
	got := map[string]bool{}
	for _, c := range Cultures() {
		got[c] = true
	}
	for _, want := range expectedCultures {
		if !got[want] {
			t.Errorf("culture %q not loaded (got %v)", want, Cultures())
		}
	}
	if len(Cultures()) < 8 {
		t.Errorf("want >= 8 cultures, got %d: %v", len(Cultures()), Cultures())
	}
}

// L12 floors: every starting culture generates >= 400 distinct first names and
// >= 400 distinct surnames, and has a pattern for every non-person kind.
func TestCultureBankFloors(t *testing.T) {
	for _, c := range expectedCultures {
		first, err := CultureBankLen(c, "firstnames")
		if err != nil {
			t.Fatalf("bank %s/firstnames: %v", c, err)
		}
		last, err := CultureBankLen(c, "surnames")
		if err != nil {
			t.Fatalf("bank %s/surnames: %v", c, err)
		}
		place, err := CultureBankLen(c, "placewords")
		if err != nil {
			t.Fatalf("bank %s/placewords: %v", c, err)
		}
		if first < 400 {
			t.Errorf("%s: first names %d < 400", c, first)
		}
		if last < 400 {
			t.Errorf("%s: surnames %d < 400", c, last)
		}
		if place < 40 {
			t.Errorf("%s: place words %d < 40", c, place)
		}

		// The static banks must be distinct and must not contain a real name.
		for _, bank := range []string{"firstnames", "surnames", "placewords"} {
			words, err := CultureBankWords(c, bank)
			if err != nil {
				t.Fatal(err)
			}
			seen := map[string]bool{}
			for _, w := range words {
				if seen[w] {
					t.Errorf("%s/%s: duplicate bank entry %q", c, bank, w)
				}
				seen[w] = true
				if namecore.Denied(w) {
					t.Errorf("%s/%s: bank contains denied name %q", c, bank, w)
				}
			}
		}

		patterns, err := CulturePatterns(c)
		if err != nil {
			t.Fatalf("patterns %s: %v", c, err)
		}
		for _, kind := range []Kind{KindClub, KindRegion, KindCity, KindDistrict, KindStadium} {
			if len(patterns[string(kind)]) == 0 {
				t.Errorf("%s: no %s patterns", c, kind)
			}
		}
	}
}

// Every culture must produce a non-empty name for every kind, and duplicates
// within one generated batch are forbidden.
func TestGeneratePerCultureAndKind(t *testing.T) {
	for _, c := range expectedCultures {
		for _, kind := range AllKinds {
			names, err := GenerateUnique(c, kind, 42, 64)
			if err != nil {
				t.Fatalf("%s/%s: %v", c, kind, err)
			}
			if len(names) != 64 {
				t.Fatalf("%s/%s: got %d names", c, kind, len(names))
			}
			seen := map[string]bool{}
			for _, n := range names {
				if strings.TrimSpace(n) == "" {
					t.Errorf("%s/%s: empty name", c, kind)
				}
				if seen[n] {
					t.Errorf("%s/%s: duplicate %q", c, kind, n)
				}
				seen[n] = true
			}
			if kind == KindFull {
				if !strings.Contains(names[0], "__") {
					t.Errorf("%s full name %q missing __ separator", c, names[0])
				}
			}
		}
	}
}

func TestDeterministicPerSeed(t *testing.T) {
	for _, c := range expectedCultures {
		for _, kind := range AllKinds {
			a, err := GenerateUnique(c, kind, 7, 25)
			if err != nil {
				t.Fatal(err)
			}
			b, err := GenerateUnique(c, kind, 7, 25)
			if err != nil {
				t.Fatal(err)
			}
			if fmt.Sprint(a) != fmt.Sprint(b) {
				t.Errorf("%s/%s: same seed produced different names", c, kind)
			}
		}
	}
}

// L12: generated names must never collide with the real-world deny-list. The
// full-name kind is the strongest check because it can match a full real name.
func TestDenylist(t *testing.T) {
	if namecore.DenylistSize() == 0 {
		t.Fatal("deny-list is empty")
	}
	mustDeny := []string{"Lionel Messi", "cristiano ronaldo", "Real Madrid", "Manchester United", "Bayern Munich"}
	for _, s := range mustDeny {
		if !namecore.Denied(s) {
			t.Errorf("deny-list failed to catch %q", s)
		}
	}
	for _, c := range expectedCultures {
		for _, kind := range AllKinds {
			names, err := GenerateUnique(c, kind, 99, 500)
			if err != nil {
				t.Fatal(err)
			}
			for _, n := range names {
				if namecore.Denied(n) {
					t.Errorf("%s/%s generated denied name %q", c, kind, n)
				}
			}
		}
	}
}

// Collision rate over 100k generated names: full person names (first__last)
// and first names, per culture. Collision rate = duplicates / total.
func TestCollisionRate100k(t *testing.T) {
	const n = 100_000
	var totalFull, distinctFull int
	for i, c := range expectedCultures {
		fulls, err := GenerateBatch(c, KindFull, int64(i)+1, n)
		if err != nil {
			t.Fatal(err)
		}
		firsts, err := GenerateBatch(c, KindFirst, int64(i)+1, n)
		if err != nil {
			t.Fatal(err)
		}
		seenFull := make(map[string]struct{}, n)
		for _, s := range fulls {
			seenFull[s] = struct{}{}
		}
		seenFirst := make(map[string]struct{}, n)
		for _, s := range firsts {
			seenFirst[s] = struct{}{}
		}
		fullRate := float64(n-len(seenFull)) / float64(n)
		firstRate := float64(n-len(seenFirst)) / float64(n)
		t.Logf("culture=%-11s full-collision-rate=%.4f first-collision-rate=%.4f (distinct full %d/%d)",
			c, fullRate, firstRate, len(seenFull), n)
		if fullRate > 0.05 {
			t.Errorf("%s: full-name collision rate %.4f > 0.05", c, fullRate)
		}
		totalFull += n
		distinctFull += len(seenFull)
	}
	t.Logf("aggregate full-name collision rate over %d names = %.4f", totalFull,
		float64(totalFull-distinctFull)/float64(totalFull))
}

func TestResolveAliases(t *testing.T) {
	cases := map[string]string{
		"karsh":             "karsh",
		"bellean":           "karsh",
		"Bellean":           "karsh",
		"ekhastan":          "karsh",
		"ashter":            "karsh",
		"kev":               "kev",
		"Free State of Kev": "kev",
		"simeone":           "legardio",
		"hunteerland":       "hunterlaan",
		"upp":               "inga",
		"palaba":            "inga",
		"kiyoto":            "kiyoto",
	}
	for in, want := range cases {
		got, err := resolveCulture(in)
		if err != nil {
			t.Errorf("resolveCulture(%q): %v", in, err)
			continue
		}
		if got != want {
			t.Errorf("resolveCulture(%q) = %q, want %q", in, got, want)
		}
	}
	if _, err := resolveCulture("martian"); err == nil {
		t.Error("resolveCulture(martian) should fail")
	}
}

// Mix-aware generation must follow the country's weights, and the returned
// histogram must add up to the requested count.
func TestMixAwareHistogram(t *testing.T) {
	const n = 20_000
	names, dist, err := GenerateMixed("bellean", KindFull, 2026, n)
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != n {
		t.Fatalf("got %d names, want %d", len(names), n)
	}
	sum := 0
	for _, v := range dist {
		sum += v
	}
	if sum != n {
		t.Fatalf("histogram sums to %d, want %d", sum, n)
	}
	// Bellean mix: karsh 60, legardio 15, inga 15, kiyoto 10.
	want := map[string]float64{"karsh": 0.60, "legardio": 0.15, "inga": 0.15, "kiyoto": 0.10}
	for c, w := range want {
		got := float64(dist[c]) / float64(n)
		if diff := got - w; diff > 0.03 || diff < -0.03 {
			t.Errorf("bellean mix %s = %.3f, want %.2f (+-0.03)", c, got, w)
		}
	}
	if len(dist) != 4 {
		t.Errorf("want 4 cultures drawn, got %d: %v", len(dist), dist)
	}
}
