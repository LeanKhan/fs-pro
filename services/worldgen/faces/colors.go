package faces

import "regexp"

// colorPalettes lists candidate hex values for each CSS custom property used
// by the pack-3 (sprite-derived) part SVGs, e.g. var(--skin, #b97855). Each
// identity picks independently per color key, seeded the same way as a
// slot pick, so colors don't reshuffle when a part pool changes and vice
// versa.
var colorPalettes = map[string][]string{
	"skin":        {"#f2c9a0", "#e8b384", "#d9a066", "#c68642", "#8d5524", "#5a3825"},
	"skin-shadow": {"#c9986b", "#a8734a", "#7f4f39", "#68402d", "#40261b"},
	"hair":        {"#2b1b14", "#4a2f1a", "#1a1a1a", "#6b4423", "#a83232", "#e0c068", "#9a9a9a"},
	"eye":         {"#4b2f1f", "#3b6ea5", "#4a8f4a", "#7a5229", "#1e293b"},
	"eye-white":   {"#ffffff", "#f5f0e6"},
	"pupil":       {"#111111", "#1a1a1a"},
	"lip":         {"#7b3f3f", "#704139", "#8a4a4a", "#5c2e2e"},
	"teeth":       {"#ffffff"},
	"accessory":   {"#222222", "#3b3b3b", "#5a3825", "#8b5a2b"},
	"jewelry":     {"#d5a31a", "#c0c0c0", "#b87333"},
	"scar":        {"#8b4e45"},
	"freckle":     {"#8a5a43"},
	"line":        {"#231914", "#2b2b2b"},
}

// cssVarPattern matches var(--name, fallback) references in part SVGs.
var cssVarPattern = regexp.MustCompile(`var\(--([a-z-]+)\s*,\s*([^)]*)\)`)

// resolveColors substitutes every var(--name, fallback) reference in svg
// with a color chosen deterministically from identity. A --name with no
// registered palette falls back to its literal fallback value, so unknown
// custom properties degrade gracefully instead of breaking the SVG.
func resolveColors(identity, svg string) string {
	return cssVarPattern.ReplaceAllStringFunc(svg, func(match string) string {
		groups := cssVarPattern.FindStringSubmatch(match)
		name, fallback := groups[1], groups[2]

		palette, ok := colorPalettes[name]
		if !ok || len(palette) == 0 {
			return fallback
		}

		seed := slotSeed(identity, Slot("color:"+name))
		return palette[seed%uint64(len(palette))]
	})
}
