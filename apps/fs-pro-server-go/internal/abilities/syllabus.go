package abilities

// The syllabus (03 §2.1 vector 1) is the facility-tier gate: the Coaching
// Department / Video Analysis decides which abilities can be taught at all, the
// player's mastery decides how many and which tier they can hold, and the match
// context decides when an ability fires. This file owns the first vector; the
// second is CanLearn/MasteryTierForXp and the third lives in sim-core.

// MaxFacilityTier is the top of the synthetic 0..5 facility-tier scale the
// syllabus uses. It is deliberately decoupled from a single campus building so
// the content (Ability.FacilityTier) never hard-codes asset keys.
const MaxFacilityTier = 5

// FacilityTierForResearch maps the Coaching Department and Video Analysis
// levels onto the syllabus facility tier (04 §1.1: "Coaching Dept / Video
// Analysis -> unlocks ability tiers"). Coaching grants tiers 0..3; Video
// Analysis extends to 5. Inputs are clamped, so raw ClubAssets levels are safe.
func FacilityTierForResearch(coachingLevel, videoLevel int) int {
	coaching := clampInt(coachingLevel, 0, 3)
	video := clampInt(videoLevel, 0, 2)
	return clampInt(coaching+video, 0, MaxFacilityTier)
}

// SyllabusTier is a facility tier and the abilities it teaches.
type SyllabusTier struct {
	FacilityTier int
	Abilities    []Ability
}

// Syllabus groups the catalogue by the facility tier that teaches it, filtered
// to a player's family (ALL-family abilities are included for every family).
// Empty tiers are omitted, so the result is the concrete "what does upgrading
// my Coaching Department/unlock next" list.
func Syllabus(family Family) []SyllabusTier {
	byTier := map[int][]Ability{}
	for _, a := range Registry {
		if a.Family != FamilyALL && a.Family != family {
			continue
		}
		byTier[a.FacilityTier] = append(byTier[a.FacilityTier], a)
	}
	out := make([]SyllabusTier, 0, len(byTier))
	for tier := 0; tier <= MaxFacilityTier; tier++ {
		if list, ok := byTier[tier]; ok {
			out = append(out, SyllabusTier{FacilityTier: tier, Abilities: list})
		}
	}
	return out
}

// CanSlot reports whether a player of `family` may slot an ability given the
// club's facility tier and the player's mastery tier in that ability. It adds
// the family check to the pure CanLearn gate; the mastery tier is per-ability
// (the PlayerMastery table is keyed by player + ability).
func CanSlot(a Ability, family Family, facilityTier, masteryTier int) bool {
	if a.Family != FamilyALL && a.Family != family {
		return false
	}
	return CanLearn(a, facilityTier, masteryTier)
}

// FamilyOfArchetypeID resolves the syllabus family for an archetype id, or
// FamilyALL when the id is unknown.
func FamilyOfArchetypeID(id string) Family {
	if a, ok := ArchetypeFor(id); ok {
		return a.Family
	}
	return FamilyALL
}

// AbilityByID resolves a registry entry by id.
func AbilityByID(id string) (Ability, bool) {
	for _, a := range Registry {
		if a.ID == id {
			return a, true
		}
	}
	return Ability{}, false
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
