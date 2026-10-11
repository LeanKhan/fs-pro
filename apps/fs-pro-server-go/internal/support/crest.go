package support

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
)

// Club crests and kits (Node: controllers/world/atlas.router.ts crestRouter /
// kitRouter). A founded club stores a CrestDesign in Clubs.Crest and is drawn
// here; the original clubs keep their hand-drawn images, which redirect to the
// static /img mount. The SVG is a byte-for-byte port of
// packages/api-contract/src/crest.ts renderCrestSvg / renderKitSvg.

var (
	crestCodeRE  = regexp.MustCompile(`^[A-Z0-9]{1,8}$`)
	crestHexRE   = regexp.MustCompile(`(?i)^#[0-9a-f]{6}$`)
	crestInitRE  = regexp.MustCompile(`^[A-Z0-9]{0,4}$`)
	crestIDStrip = regexp.MustCompile(`(?i)[^a-z0-9_-]`)
)

const crestOutline = "#3b2a1a"

var crestShapes = map[string]string{
	"shield":  "M50 4 L92 15 V50 C92 80 74 98 50 108 C26 98 8 80 8 50 V15 Z",
	"heater":  "M8 6 H92 V46 C92 77 73 97 50 108 C27 97 8 77 8 46 Z",
	"round":   "M50 8 A48 48 0 1 1 49.9 8 Z",
	"badge":   "M30 5 H70 L94 29 V77 L70 107 H30 L6 77 V29 Z",
	"pennant": "M8 6 H92 V80 L50 108 L8 80 Z",
}

var crestShapeOrder = []string{"shield", "heater", "round", "badge", "pennant"}
var crestPatternOrder = []string{"plain", "stripes", "hoops", "halves", "sash", "chevron", "quarters", "cross"}
var crestEmblemOrder = []string{"ball", "star", "crown", "bolt", "wave", "tree", "tower", "anchor", "none"}
var crestPalette = []string{
	"#d8342c", "#8e1b2b", "#f08a1c", "#f5b82e", "#2f8a1c", "#5cc23a", "#13795b", "#2fb3a6",
	"#3a8ee0", "#1f4fa3", "#14204a", "#6a3fb5", "#c2389b", "#f2f2ee", "#2b2b30", "#8a5a3b",
}

var crestEmblems = map[string]func(t string) string{
	"ball": func(t string) string {
		return fmt.Sprintf(`<circle r="17" fill="%s" stroke="%s" stroke-width="3"/><path d="M0 -7 L7 -2 L4.5 6.5 H-4.5 L-7 -2 Z" fill="%s"/><path d="M0 -7 V-17 M7 -2 L16 -6 M4.5 6.5 L10 14 M-4.5 6.5 L-10 14 M-7 -2 L-16 -6" stroke="%s" stroke-width="2.4"/>`, t, crestOutline, crestOutline, crestOutline)
	},
	"star": func(t string) string {
		return fmt.Sprintf(`<path d="M0 -20 L5.9 -8.1 L19 -6.2 L9.5 3.1 L11.8 16.2 L0 10 L-11.8 16.2 L-9.5 3.1 L-19 -6.2 L-5.9 -8.1 Z" fill="%s" stroke="%s" stroke-width="3" stroke-linejoin="round"/>`, t, crestOutline)
	},
	"crown": func(t string) string {
		return fmt.Sprintf(`<path d="M-19 12 L-21 -10 L-9 0 L0 -16 L9 0 L21 -10 L19 12 Z" fill="%s" stroke="%s" stroke-width="3" stroke-linejoin="round"/><rect x="-19" y="12" width="38" height="7" rx="2" fill="%s" stroke="%s" stroke-width="3"/>`, t, crestOutline, t, crestOutline)
	},
	"bolt": func(t string) string {
		return fmt.Sprintf(`<path d="M4 -21 L-13 3 H-1 L-5 21 L13 -4 H1 Z" fill="%s" stroke="%s" stroke-width="3" stroke-linejoin="round"/>`, t, crestOutline)
	},
	"wave": func(t string) string {
		return fmt.Sprintf(`<path d="M-21 2 C-14 -12 -4 -12 1 -2 C5 6 13 5 19 -4 V14 H-21 Z" fill="%s" stroke="%s" stroke-width="3" stroke-linejoin="round"/><path d="M-21 -8 C-14 -20 -4 -20 1 -10" stroke="%s" stroke-width="4" fill="none" stroke-linecap="round"/>`, t, crestOutline, t)
	},
	"tree": func(t string) string {
		return fmt.Sprintf(`<path d="M0 -21 L15 2 H7 L17 13 H-17 L-7 2 H-15 Z" fill="%s" stroke="%s" stroke-width="3" stroke-linejoin="round"/><rect x="-3.5" y="13" width="7" height="8" fill="%s"/>`, t, crestOutline, crestOutline)
	},
	"tower": func(t string) string {
		return fmt.Sprintf(`<path d="M-15 20 V-6 H-15 V-16 H-8 V-10 H-3 V-16 H3 V-10 H8 V-16 H15 V20 Z" fill="%s" stroke="%s" stroke-width="3" stroke-linejoin="round"/><path d="M-5 20 V8 A5 5 0 0 1 5 8 V20" fill="%s"/>`, t, crestOutline, crestOutline)
	},
	"anchor": func(t string) string {
		const d = `<circle cy="-14" r="5"/><path d="M0 -9 V19 M-10 -2 H10 M-17 6 C-15 16 -7 20 0 19 C7 20 15 16 17 6"/>`
		return fmt.Sprintf(`<g fill="none" stroke="%s" stroke-width="7" stroke-linecap="round">%s</g><g fill="none" stroke="%s" stroke-width="3.4" stroke-linecap="round">%s</g>`, crestOutline, d, t, d)
	},
}

// crestDesign is the validated Clubs.Crest shape.
type crestDesign struct {
	Shape, Pattern, Emblem   string
	Primary, Secondary, Trim string
	Initials                 string
}

func containsString(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// parseCrestDesign mirrors isCrestDesign; ok is false for anything else
// (including the original clubs' non-design Crest values).
func parseCrestDesign(v any) (crestDesign, bool) {
	m, _ := v.(map[string]any)
	if m == nil {
		if raw, ok := v.(string); ok && strings.HasPrefix(strings.TrimSpace(raw), "{") {
			_ = json.Unmarshal([]byte(raw), &m)
		}
	}
	if m == nil {
		return crestDesign{}, false
	}
	s := func(k string) string { x, _ := m[k].(string); return x }
	d := crestDesign{s("shape"), s("pattern"), s("emblem"), s("primary"), s("secondary"), s("trim"), s("initials")}
	_, initOK := m["initials"].(string)
	ok := containsString(crestShapeOrder, d.Shape) && containsString(crestPatternOrder, d.Pattern) &&
		containsString(crestEmblemOrder, d.Emblem) && crestHexRE.MatchString(d.Primary) &&
		crestHexRE.MatchString(d.Secondary) && crestHexRE.MatchString(d.Trim) &&
		initOK && crestInitRE.MatchString(d.Initials)
	return d, ok
}

// fnv32 is crest.ts's hash (FNV-1a with Math.imul, unsigned).
func fnv32(s string) uint32 {
	h := uint32(2166136261)
	for _, c := range []byte(s) {
		h = (h ^ uint32(c)) * 16777619
	}
	return h
}

func crestLuminance(hex string) float64 {
	var r, g, b int
	_, _ = fmt.Sscanf(hex[1:], "%02x%02x%02x", &r, &g, &b)
	return 0.2126*float64(r)/255 + 0.7152*float64(g)/255 + 0.0722*float64(b)/255
}

// randomCrest mirrors crest.ts randomCrest (used for the invalid-design fallback).
func randomCrest(seed string) crestDesign {
	pick := func(list []string, salt int) string {
		return list[fnv32(fmt.Sprintf("%d:%s", salt, seed))%uint32(len(list))]
	}
	strong := make([]string, 0, len(crestPalette))
	for _, c := range crestPalette {
		if c != "#f2f2ee" {
			strong = append(strong, c)
		}
	}
	primary := pick(strong, 0)
	secondary := pick(crestPalette, 5)
	if secondary == primary {
		secondary = "#f2f2ee"
	}
	trim := "#fffaf0"
	if crestLuminance(primary) > 0.6 {
		trim = "#2b2b30"
	}
	return crestDesign{pick(crestShapeOrder, 3), pick(crestPatternOrder, 9), pick(crestEmblemOrder[:len(crestEmblemOrder)-1], 13), primary, secondary, trim, ""}
}

func crestPatternSvg(p, a, b string) string {
	base := fmt.Sprintf(`<rect width="100" height="112" fill="%s"/>`, a)
	switch p {
	case "stripes":
		return base + fmt.Sprintf(`<rect x="14" width="14" height="112" fill="%[1]s"/><rect x="43" width="14" height="112" fill="%[1]s"/><rect x="72" width="14" height="112" fill="%[1]s"/>`, b)
	case "hoops":
		return base + fmt.Sprintf(`<rect y="18" width="100" height="14" fill="%[1]s"/><rect y="46" width="100" height="14" fill="%[1]s"/><rect y="74" width="100" height="14" fill="%[1]s"/>`, b)
	case "halves":
		return base + fmt.Sprintf(`<rect x="50" width="50" height="112" fill="%s"/>`, b)
	case "sash":
		return base + fmt.Sprintf(`<path d="M-10 18 L22 -8 L112 92 L80 118 Z" fill="%s"/>`, b)
	case "chevron":
		return base + fmt.Sprintf(`<path d="M0 34 L50 66 L100 34 V58 L50 90 L0 58 Z" fill="%s"/>`, b)
	case "quarters":
		return base + fmt.Sprintf(`<rect x="50" width="50" height="56" fill="%[1]s"/><rect y="56" width="50" height="56" fill="%[1]s"/>`, b)
	case "cross":
		return base + fmt.Sprintf(`<rect x="41" width="18" height="112" fill="%[1]s"/><rect y="44" width="100" height="18" fill="%[1]s"/>`, b)
	default:
		return base
	}
}

const crestFont = `Fredoka, 'Arial Rounded MT Bold', system-ui, sans-serif`

// renderCrestSvg ports crest.ts renderCrestSvg.
func renderCrestSvg(d crestDesign, id string) string {
	clip := "crest-" + crestIDStrip.ReplaceAllString(id, "")
	shape := crestShapes[d.Shape]
	ini := d.Initials
	hasEmblem := d.Emblem != "none"
	ribbonY := 74
	if d.Shape == "round" {
		ribbonY = 72
	}
	emblem := ""
	if hasEmblem {
		y, scale := "54", "1.25"
		if ini != "" {
			y, scale = "46", "1"
		}
		emblem = fmt.Sprintf(`<g transform="translate(50 %s) scale(%s)">%s</g>`, y, scale, crestEmblems[d.Emblem](d.Trim))
	}
	letters := ""
	if ini != "" {
		if hasEmblem {
			size := 15
			if len(ini) > 3 {
				size = 13
			}
			letters = fmt.Sprintf(`<path d="M14 %d H86 L80 %d L86 %d H14 L20 %d Z" fill="%s" stroke="%s" stroke-width="3" stroke-linejoin="round"/>`, ribbonY, ribbonY+10, ribbonY+20, ribbonY+10, d.Trim, crestOutline) +
				fmt.Sprintf(`<text x="50" y="%d" text-anchor="middle" font-family="%s" font-weight="700" font-size="%d" letter-spacing="1" fill="%s">%s</text>`, ribbonY+15, crestFont, size, crestOutline, ini)
		} else {
			y, size := 70, 38
			if len(ini) > 2 {
				y, size = 66, 28
			}
			letters = fmt.Sprintf(`<text x="50" y="%d" text-anchor="middle" font-family="%s" font-weight="700" font-size="%d" fill="%s" stroke="%s" stroke-width="3" paint-order="stroke">%s</text>`, y, crestFont, size, d.Trim, crestOutline, ini)
		}
	}
	return fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 112" data-kit="%s,%s">`, d.Primary, d.Secondary) +
		fmt.Sprintf(`<defs><clipPath id="%s"><path d="%s"/></clipPath></defs>`, clip, shape) +
		fmt.Sprintf(`<g clip-path="url(#%s)">%s`, clip, crestPatternSvg(d.Pattern, d.Primary, d.Secondary)) +
		`<path d="M0 0 H100 V40 C70 30 30 30 0 40 Z" fill="#fff" opacity=".14"/></g>` +
		fmt.Sprintf(`<path d="%s" fill="none" stroke="%s" stroke-width="5" stroke-linejoin="round"/>`, shape, crestOutline) +
		fmt.Sprintf(`<path d="%s" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.6" transform="translate(50 56) scale(.9) translate(-50 -56)"/>`, shape) +
		emblem + letters + `</svg>`
}

const kitShirt = "M30 8 L42 4 C45 10 55 10 58 4 L70 8 L92 22 L84 40 L74 35 V96 H26 V35 L16 40 L8 22 Z"

// renderKitSvg ports crest.ts renderKitSvg.
func renderKitSvg(d crestDesign, id string) string {
	clip := "kit-" + crestIDStrip.ReplaceAllString(id, "")
	return fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-kit="%s,%s">`, d.Primary, d.Secondary) +
		fmt.Sprintf(`<defs><clipPath id="%s"><path d="%s"/></clipPath></defs>`, clip, kitShirt) +
		fmt.Sprintf(`<g clip-path="url(#%s)"><g transform="translate(0 -6)">%s</g>`, clip, crestPatternSvg(d.Pattern, d.Primary, d.Secondary)) +
		fmt.Sprintf(`<path d="M8 22 L30 8 L26 35 L16 40 Z M92 22 L70 8 L74 35 L84 40 Z" fill="%s" opacity=".9"/></g>`, d.Secondary) +
		fmt.Sprintf(`<path d="%s" fill="none" stroke="%s" stroke-width="3.5" stroke-linejoin="round"/>`, kitShirt, crestOutline) +
		fmt.Sprintf(`<path d="M42 4 C45 13 55 13 58 4" fill="none" stroke="%s" stroke-width="4"/>`, d.Trim) +
		`</svg>`
}

// clubCrest loads a club's code + Crest by code (case-insensitive).
func (h *Handlers) clubCrest(w http.ResponseWriter, r *http.Request) (code string, crest any, ok bool) {
	code = strings.ToUpper(strings.TrimSuffix(strings.TrimSuffix(r.PathValue("file"), ".svg"), ".SVG"))
	if !crestCodeRE.MatchString(code) {
		w.WriteHeader(http.StatusBadRequest)
		return "", nil, false
	}
	rows, err := h.q.Query(r.Context(), `SELECT "ClubCode", "Crest" FROM "Clubs" WHERE upper("ClubCode") = $1 LIMIT 1`, code)
	if err != nil {
		h.serverError(w, "load crest", err)
		return "", nil, false
	}
	row, found, err := db.ScanOne(rows)
	if err != nil {
		h.serverError(w, "load crest", err)
		return "", nil, false
	}
	if !found {
		w.WriteHeader(http.StatusNotFound)
		return "", nil, false
	}
	return db.StringField(row, "ClubCode"), row["Crest"], true
}

// crest is GET /api/crests/{file}: a founded club's crest SVG, or a redirect to
// an original club's logo image.
func (h *Handlers) crest(w http.ResponseWriter, r *http.Request) {
	code, raw, ok := h.clubCrest(w, r)
	if !ok {
		return
	}
	d, isDesign := parseCrestDesign(raw)
	if !isDesign {
		w.Header().Set("Cache-Control", "public, max-age=300")
		http.Redirect(w, r, "/img/clubs/logos/"+url.PathEscape(code)+".png", http.StatusFound)
		return
	}
	writeSVG(w, renderCrestSvg(d, strings.ToLower(code)), "public, max-age=300")
}

// kit is GET /api/kits/{file}: a founded club's shirt, or a redirect to an
// original club's kit image.
func (h *Handlers) kit(w http.ResponseWriter, r *http.Request) {
	code, raw, ok := h.clubCrest(w, r)
	if !ok {
		return
	}
	d, isDesign := parseCrestDesign(raw)
	if !isDesign {
		http.Redirect(w, r, "/img/clubs/kits/"+url.PathEscape(code)+"-kit.png", http.StatusFound)
		return
	}
	writeSVG(w, renderKitSvg(d, strings.ToLower(code)), "public, max-age=300")
}

// assetsDir is where the static /img mount reads from (Node: express.static
// 'assets'). ASSETS_DIR overrides; the default is the Node app's assets folder
// next to this module, so a Go-only stack serves the original clubs' images.
func assetsDir() string {
	if d := strings.TrimSpace(os.Getenv("ASSETS_DIR")); d != "" {
		return d
	}
	for _, c := range []string{"../fs-pro-server/assets", "apps/fs-pro-server/assets", "assets"} {
		if st, err := os.Stat(filepath.Join(c, "img")); err == nil && st.IsDir() {
			return c
		}
	}
	return "assets"
}

// registerCrests wires the crest/kit routes and the static /img mount.
func registerCrests(srv *httpapi.Server, h *Handlers) {
	srv.RegisterRaw("support.getCrest", http.MethodGet, "/api/crests/{file}", []int{200, 302, 400, 404}, h.crest)
	srv.RegisterRaw("support.getKit", http.MethodGet, "/api/kits/{file}", []int{200, 302, 400, 404}, h.kit)
	img := http.StripPrefix("/img/", http.FileServer(http.Dir(filepath.Join(assetsDir(), "img"))))
	srv.HandleRaw(http.MethodGet, "/img/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=300")
		img.ServeHTTP(w, r)
	})
}
