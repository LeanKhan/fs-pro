// Package faces generates deterministic character face SVGs for the world
// simulator, ported from imagination's internal/faces. It is served over
// HTTP by fs-pro's services/worldgen. The same identity (e.g. a
// character's name) always produces the same face. Each face "slot"
// (outline, eyes, nose, ...) is seeded independently from the identity, so
// adding a new slot or growing an existing slot's part pool never reshuffles
// unrelated slots.
package faces

import (
	"embed"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"sort"
	"strings"
)

//go:embed data/parts/*.json
var partsFS embed.FS

// Slot is a layer of the face, rendered in slotOrder.
type Slot string

const (
	SlotOutline     Slot = "outline"
	SlotEars        Slot = "ears"
	SlotDetails     Slot = "details"
	SlotEyebrows    Slot = "eyebrows"
	SlotEyes        Slot = "eyes"
	SlotNose        Slot = "nose"
	SlotMouth       Slot = "mouth"
	SlotFacialHair  Slot = "facial-hair"
	SlotHair        Slot = "hair"
	SlotAccessories Slot = "accessories"
)

// slotOrder is both the render (z-index) order and the full set of slots
// known across every version. A version need not populate every slot (see
// slotFile) — appending a new slot here, or a version not using one, is
// safe: existing identities' picks for other slots are unaffected, since
// each slot's pick is seeded independently below.
var slotOrder = []Slot{
	SlotOutline,
	SlotEars,
	SlotDetails,
	SlotEyebrows,
	SlotEyes,
	SlotNose,
	SlotMouth,
	SlotFacialHair,
	SlotHair,
	SlotAccessories,
}

type part struct {
	ID  string `json:"id"`
	SVG string `json:"svg"`
}

// Version selects which part pack a face is drawn from. Packs are kept as
// separate files (rather than merged into the base slot files) so each
// pack's part pool can grow independently without reshuffling the other
// pack's picks.
type Version string

const (
	V1 Version = "v1"
	V2 Version = "v2"
	V3 Version = "v3"

	DefaultVersion = V1
)

// slotFile names the data file for one slot in one version. Filenames are
// listed explicitly rather than derived, since packs don't follow a single
// consistent naming rule (e.g. "facial-hair.json" vs
// "facial_hair_pack_2.json") and not every version populates every slot
// (v1/v2 have no ears or details layer) — a version simply omits the slots
// it doesn't support, and GenerateSVG skips those.
var slotFile = map[Version]map[Slot]string{
	V1: {
		SlotOutline:     "outline.json",
		SlotEyebrows:    "eyebrows.json",
		SlotEyes:        "eyes.json",
		SlotNose:        "nose.json",
		SlotMouth:       "mouth.json",
		SlotFacialHair:  "facial-hair.json",
		SlotHair:        "hair.json",
		SlotAccessories: "accessories.json",
	},
	V2: {
		SlotOutline:     "outline_pack_2.json",
		SlotEyebrows:    "eyebrows_pack_2.json",
		SlotEyes:        "eyes_pack_2.json",
		SlotNose:        "nose_pack_2.json",
		SlotMouth:       "mouth_pack_2.json",
		SlotFacialHair:  "facial_hair_pack_2.json",
		SlotHair:        "hair_pack_2.json",
		SlotAccessories: "accessories_pack_2.json",
	},
	V3: {
		SlotOutline:     "outline_pack_3.json",
		SlotEars:        "ears_pack_3.json",
		SlotDetails:     "details_pack_3.json",
		SlotEyebrows:    "eyebrows_pack_3.json",
		SlotEyes:        "eyes_pack_3.json",
		SlotNose:        "nose_pack_3.json",
		SlotMouth:       "mouth_pack_3.json",
		SlotFacialHair:  "facial_hair_pack_3.json",
		SlotHair:        "hair_pack_3.json",
		SlotAccessories: "accessories_pack_3.json",
	},
}

var partPools map[Version]map[Slot][]part

func init() {
	partPools = make(map[Version]map[Slot][]part, len(slotFile))
	for version, files := range slotFile {
		partPools[version] = make(map[Slot][]part, len(files))
		for slot, filename := range files {
			raw, err := partsFS.ReadFile("data/parts/" + filename)
			if err != nil {
				panic(fmt.Sprintf("faces: reading %s: %v", filename, err))
			}
			var pool []part
			if err := json.Unmarshal(raw, &pool); err != nil {
				panic(fmt.Sprintf("faces: parsing %s: %v", filename, err))
			}
			if len(pool) == 0 {
				panic(fmt.Sprintf("faces: part pool in %s is empty", filename))
			}
			partPools[version][slot] = pool
		}
	}
}

// slotSeed derives an independent seed for one slot from the identity, so
// that picks for other slots never move when this slot's pool changes.
func slotSeed(identity string, slot Slot) uint64 {
	h := fnv.New64a()
	h.Write([]byte(identity))
	h.Write([]byte{0}) // separator: "ab"+"c" must not hash the same as "a"+"bc"
	h.Write([]byte(slot))
	return h.Sum64()
}

// pickPart returns the chosen part for slot, or ok=false if this version
// doesn't populate that slot at all.
func pickPart(identity string, version Version, slot Slot) (p part, ok bool) {
	pool, ok := partPools[version][slot]
	if !ok {
		return part{}, false
	}
	seed := slotSeed(identity, slot)
	return pool[seed%uint64(len(pool))], true
}

const (
	canvasWidth  = 100
	canvasHeight = 100
)

// IsValidVersion reports whether version names a known part pack.
func IsValidVersion(version Version) bool {
	_, ok := slotFile[version]
	return ok
}

// Versions returns the known part-pack versions, sorted, for a stable
// response (see the /health handler).
func Versions() []Version {
	out := make([]Version, 0, len(slotFile))
	for version := range slotFile {
		out = append(out, version)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// GenerateSVG returns the full face SVG for the given identity (e.g. a
// character's name or any other stable string) drawn from the given part
// pack version. The same identity + version always returns the same SVG,
// given the same part pools.
func GenerateSVG(identity string, version Version) string {
	var body strings.Builder
	for _, slot := range slotOrder {
		p, ok := pickPart(identity, version, slot)
		if !ok || p.SVG == "" {
			continue
		}
		body.WriteString(p.SVG)
	}

	return fmt.Sprintf(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d">%s</svg>`,
		canvasWidth, canvasHeight, resolveColors(identity, body.String()),
	)
}
