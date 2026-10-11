package support

import (
	"encoding/json"
	"os"
	"testing"
)

// TestCrestParity pins the Go crest/kit SVG to the TypeScript renderer
// (packages/api-contract/src/crest.ts). testdata/crest_golden.json is that
// renderer's output for a spread of designs plus the invalid-design fallback.
func TestCrestParity(t *testing.T) {
	raw, err := os.ReadFile("testdata/crest_golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		D     map[string]any `json:"d"`
		Crest string         `json:"crest"`
		Kit   string         `json:"kit"`
	}
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	for i, c := range cases {
		if c.D == nil {
			if got := renderCrestSvg(randomCrest("fallback"), "fb"); got != c.Crest {
				t.Errorf("fallback crest mismatch\n got %s\nwant %s", got, c.Crest)
			}
			continue
		}
		d, ok := parseCrestDesign(c.D)
		if !ok {
			t.Fatalf("case %d: design rejected: %v", i, c.D)
		}
		id := "x" + string(rune('0'+i))
		if got := renderCrestSvg(d, id); got != c.Crest {
			t.Errorf("case %d crest mismatch\n got %s\nwant %s", i, got, c.Crest)
		}
		if got := renderKitSvg(d, id); got != c.Kit {
			t.Errorf("case %d kit mismatch\n got %s\nwant %s", i, got, c.Kit)
		}
	}
}

func TestParseCrestDesignRejectsLegacy(t *testing.T) {
	if _, ok := parseCrestDesign("FSP.png"); ok {
		t.Fatal("a legacy crest string must not parse as a design")
	}
	if _, ok := parseCrestDesign(map[string]any{"shape": "blob"}); ok {
		t.Fatal("an unknown shape must not parse")
	}
}
