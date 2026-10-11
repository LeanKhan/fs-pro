package atlas

import "testing"

func TestNameProblem(t *testing.T) {
	if got := nameProblem("Port Ellis", "Town name", 3, 30); got != "" {
		t.Errorf("valid name = %q", got)
	}
	if got := nameProblem("Al", "Town name", 3, 30); got != "Town name needs at least 3 characters" {
		t.Errorf("short = %q", got)
	}
	if got := nameProblem("A  B", "Name", 1, 30); got != "Name has double spaces" {
		t.Errorf("double spaces = %q", got)
	}
	if got := nameProblem("Bad@Name", "Name", 3, 30); got != "Name can only use letters, numbers, spaces and . ' & -" {
		t.Errorf("charset = %q", got)
	}
}

func TestCodeProblem(t *testing.T) {
	for _, ok := range []string{"AB", "ABC", "A1", "ABCD"} {
		if got := codeProblem(ok, "Short code"); got != "" {
			t.Errorf("%q = %q", ok, got)
		}
	}
	for _, bad := range []string{"a", "abc", "1A", "ABCDE", ""} {
		if got := codeProblem(bad, "Short code"); got != "Short code must be 2-4 capital letters or digits" {
			t.Errorf("%q = %q", bad, got)
		}
	}
}

func TestAtlasSize(t *testing.T) {
	w, h := atlasSize(nil)
	if w != atlasW || h != atlasH {
		t.Errorf("empty = %dx%d", w, h)
	}
	// A far point grows the sea with room around it.
	w, h = atlasSize([]point{{x: 3000, y: 2000}})
	if w <= 3000 || h <= 2000 {
		t.Errorf("grown = %dx%d", w, h)
	}
}

func TestIsCrestDesign(t *testing.T) {
	good := map[string]any{"shape": "circle", "pattern": "plain", "emblem": "ball", "primary": "#aabbcc", "secondary": "#112233", "trim": "#ffffff", "initials": "FC"}
	if !isCrestDesign(good) {
		t.Error("good design rejected")
	}
	if isCrestDesign(map[string]any{"primary": "not-a-colour"}) {
		t.Error("bad design accepted")
	}
}
