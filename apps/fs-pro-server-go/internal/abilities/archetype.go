package abilities

import "strings"

// Archetypes are the player "unit classes" (02 §B, "Troops -> Archetypes" in
// the 02 §10 glossary). A player is fielded as one archetype, which decides its
// housing cost and which school unlocks it. The archetype layer is data-only:
// the sim-core engine does not need to know an archetype, only the effects a
// player's slotted abilities and traits resolve to (see effects.go).
//
// There is no `Players.Archetype` column yet (02 §C flags a future
// `Players.StarTier`), so the repository derives the archetype from the
// established `Players.Position`/`Players.Role` via ArchetypeFor. The table
// below is content and is tunable without code changes.

// MaxStarTier is the highest Star-Player tier; each tier above 0 adds housing.
const MaxStarTier = 3

// StarSlotSurcharge is the extra housing space each Star tier costs: a Star
// Player is bigger than the same archetype at tier 0 (02 §B "stronger
// archetypes consume more squad slots").
const StarSlotSurcharge = 1

// Archetype is one unit class.
type Archetype struct {
	ID string
	// Name is the display name.
	Name string
	// Family is the ability syllabus family this archetype shares.
	Family Family
	// SlotCost is the housing space at Star tier 0.
	SlotCost int
	// AcademyLevel is the minimum Academy level that can field the archetype.
	AcademyLevel int
	// Elite archetypes additionally require the Elite Academy (02 §B).
	Elite bool
}

// Archetypes is the shipped archetype catalogue, in canonical order. The five
// named classes are the ones sim-core's `normalise_role` already understands
// (Anchor, Infiltrator, Sniper, Flank Rusher, Swarm), plus Keeper and the
// elite Talisman (Star Player).
var Archetypes = []Archetype{
	{ID: "keeper", Name: "Keeper", Family: FamilyGK, SlotCost: 2, AcademyLevel: 1},
	{ID: "swarm", Name: "Swarm", Family: FamilyDEF, SlotCost: 1, AcademyLevel: 1},
	{ID: "anchor", Name: "Anchor", Family: FamilyDEF, SlotCost: 3, AcademyLevel: 2},
	{ID: "infiltrator", Name: "Infiltrator", Family: FamilyMID, SlotCost: 2, AcademyLevel: 2},
	{ID: "sniper", Name: "Sniper", Family: FamilyMID, SlotCost: 3, AcademyLevel: 3},
	{ID: "flank_rusher", Name: "Flank Rusher", Family: FamilyATT, SlotCost: 2, AcademyLevel: 3},
	{ID: "talisman", Name: "Talisman", Family: FamilyATT, SlotCost: 4, AcademyLevel: 4, Elite: true},
}

// ArchetypeFor resolves an archetype by id.
func ArchetypeFor(id string) (Archetype, bool) {
	for _, a := range Archetypes {
		if a.ID == id {
			return a, true
		}
	}
	return Archetype{}, false
}

// SlotCostOf is an archetype's housing cost at a Star tier (tier 0 is the base
// cost; each tier above adds StarSlotSurcharge). ok is false for an unknown
// archetype.
func SlotCostOf(id string, starTier int) (int, bool) {
	a, ok := ArchetypeFor(id)
	if !ok {
		return 0, false
	}
	return SlotCost(a, starTier), true
}

// SlotCost is Archetype.SlotCost plus the Star-tier surcharge, clamped to the
// legal tier range.
func SlotCost(a Archetype, starTier int) int {
	if starTier < 0 {
		starTier = 0
	}
	if starTier > MaxStarTier {
		starTier = MaxStarTier
	}
	return a.SlotCost + starTier*StarSlotSurcharge
}

// positionArchetypes maps the four `Players.Position` buckets (the values the
// squad summary and the PLAY gate count) to an archetype. Position is coarse,
// so it picks the family's representative archetype.
var positionArchetypes = map[string]string{
	"GK":  "keeper",
	"DEF": "anchor",
	"MID": "sniper",
	"ATT": "flank_rusher",
}

// roleArchetypes maps the squad roles sim-core's `normalise_role` recognises as
// archetype aliases back to the archetype, and refines the coarse position
// bucket where the role is more specific.
var roleArchetypes = map[string]string{
	// The sim-core archetype aliases (03 §2.3), surfaced on the grid.
	"ANCHOR": "anchor", "INFILTRATOR": "infiltrator", "SNIPER": "sniper",
	"FLANKRUSHER": "flank_rusher", "SWARM": "swarm", "KEEPER": "keeper",
	// Squad roles (sim-core role vocabulary).
	"CDM": "anchor", "CB": "anchor", "CD": "anchor",
	"CAM": "infiltrator",
	"ST":  "sniper", "CF": "sniper",
	"CM": "swarm",
	"LM": "flank_rusher", "RM": "flank_rusher", "LW": "flank_rusher", "RW": "flank_rusher",
	"LB": "flank_rusher", "RB": "flank_rusher", "LWB": "flank_rusher", "RWB": "flank_rusher",
}

// ArchetypeForPlayer derives a player's archetype from the squad Role
// (preferred) and Position (fallback). An unknown/blank pair resolves to swarm,
// the cheapest archetype, so a squad is never over-charged on missing metadata.
func ArchetypeForPlayer(position, role string) Archetype {
	if id, ok := roleArchetypes[normalizeKey(role)]; ok {
		if a, found := ArchetypeFor(id); found {
			return a
		}
	}
	if id, ok := positionArchetypes[normalizeKey(position)]; ok {
		if a, found := ArchetypeFor(id); found {
			return a
		}
	}
	a, _ := ArchetypeFor("swarm")
	return a
}

// ArchetypeForPosition derives a player's archetype from Position alone.
func ArchetypeForPosition(position string) Archetype { return ArchetypeForPlayer(position, "") }

// familyByPosition maps the four Players.Position buckets to the ability
// syllabus family. The syllabus is positional (GK/DEF/MID/ATT); an unknown
// position yields FamilyALL, so it only reaches the ALL-family abilities.
var familyByPosition = map[string]Family{
	"GK":  FamilyGK,
	"DEF": FamilyDEF,
	"MID": FamilyMID,
	"ATT": FamilyATT,
}

// FamilyForPosition is the ability syllabus family for a player's Position. It
// is deliberately separate from the archetype (which drives housing): a "CM"
// may be a cheap Swarm archetype yet still belongs to the MID syllabus.
func FamilyForPosition(position string) Family {
	if fam, ok := familyByPosition[normalizeKey(position)]; ok {
		return fam
	}
	return FamilyALL
}

// normalizeKey upper-cases and strips separators so "Flank Rusher", "flank_rusher"
// and "FLANKRUSHER" all resolve, mirroring sim-core's normalise_role.
func normalizeKey(s string) string {
	return strings.ToUpper(strings.NewReplacer(" ", "", "_", "", "-", "").Replace(strings.TrimSpace(s)))
}
