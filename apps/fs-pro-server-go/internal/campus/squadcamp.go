package campus

import (
	"fmt"

	"fs-pro-server/internal/abilities"
)

// This file is the P2 Squad Camp and schooling model (02 §B, "Barracks & Army
// -> Academy, Squad Camp, Laboratory"). It is pure: given a squad's housing
// footprint and the club's facility levels it decides whether the squad fits and
// which archetypes a school has unlocked. The PLAY gate can consult
// SquadCampGateProblem after its own manager/keeper/size check so the squad-slot
// budget never re-derives gate.go's reasons.

// Squad Camp ("housing") capacity: base + per-level + per-Clubhouse-tier.
// Content/tunable (02 §B / L5). The base is generous enough that a canonical
// 11-player squad fits at the tier-1 start, so wiring the check never blocks a
// legal squad at level 0.
const (
	SquadCampBaseCapacity     = 30
	SquadCampCapacityPerLevel = 5
	SquadCampCapacityPerTier  = 3
	// MaxSquadCampLevel is the top Squad Camp level (05 §8 facility levels).
	MaxSquadCampLevel = 5
)

// The P2 school facility AssetType keys (02 §B): the Academy and Elite Academy
// unlock archetypes; the Coaching Department and Video Analysis unlock the
// ability syllabus tiers; the Squad Camp raises the housing cap. They are
// ClubAssets rows; the campus economy (P1) does not upgrade them yet.
const (
	FacilityAcademy       = "academy"
	FacilityEliteAcademy  = "elite_academy"
	FacilitySquadCamp     = "squad_camp"
	FacilityCoachingDept  = "coaching_dept"
	FacilityVideoAnalysis = "video_analysis"
)

// SquadCapacity is the Squad Camp cap for a camp level and Clubhouse tier. The
// tier-1, level-0 start is the base; each camp level and tier above adds slots.
func SquadCapacity(campLevel, clubhouseTier int) int {
	camp := clampRange(campLevel, 0, MaxSquadCampLevel)
	tier := clampRange(clubhouseTier, 1, MaxClubhouseTier)
	return SquadCampBaseCapacity + SquadCampCapacityPerLevel*camp + SquadCampCapacityPerTier*(tier-1)
}

// SquadMember is a player's housing footprint: an archetype and its Star tier.
type SquadMember struct {
	Archetype string
	StarTier  int
}

// SquadRefusal is a typed, client-consumable reason (the campus gate.go shape).
type SquadRefusal struct {
	Code    string
	Message string
}

// SquadUsage sums a squad's housing cost. An unknown archetype costs nothing and
// is reported via the second return so the caller can surface it.
func SquadUsage(members []SquadMember) (used int, unknown string) {
	for _, m := range members {
		cost, ok := abilities.SlotCostOf(m.Archetype, m.StarTier)
		if !ok {
			return used, m.Archetype
		}
		used += cost
	}
	return used, ""
}

// SquadProblem returns nil when a squad fits `capacity`, else a refusal naming
// the overage (02 §B: "a squad over budget must be blocked with a clear reason").
func SquadProblem(members []SquadMember, capacity int) *SquadRefusal {
	used, unknown := SquadUsage(members)
	if unknown != "" {
		return &SquadRefusal{Code: "unknown_archetype", Message: "Unknown archetype \"" + unknown + "\""}
	}
	if used > capacity {
		return &SquadRefusal{
			Code: "squad_over_capacity",
			Message: fmt.Sprintf(
				"Your squad uses %d of %d squad slots - upgrade the Squad Camp or trim %d",
				used, capacity, used-capacity),
		}
	}
	return nil
}

// SquadCampGateProblem is the additive squad-capacity check the PLAY gate can
// run after internal/play.GateProblem passes: it computes the cap from the
// club's Squad Camp level and Clubhouse tier and blocks an over-budget squad.
func SquadCampGateProblem(members []SquadMember, campLevel, clubhouseTier int) *SquadRefusal {
	return SquadProblem(members, SquadCapacity(campLevel, clubhouseTier))
}

// AcademyUnlocked reports whether the Academy and Elite Academy levels unlock an
// archetype (02 §B): base archetypes need the Academy level, elite archetypes
// additionally need the Elite Academy.
func AcademyUnlocked(id string, academyLevel, eliteLevel int) bool {
	a, ok := abilities.ArchetypeFor(id)
	if !ok {
		return false
	}
	if a.Elite && eliteLevel < 1 {
		return false
	}
	return academyLevel >= a.AcademyLevel
}

// UnlockedArchetypes lists the archetypes fieldable at the given school levels,
// in catalogue order.
func UnlockedArchetypes(academyLevel, eliteLevel int) []abilities.Archetype {
	out := make([]abilities.Archetype, 0, len(abilities.Archetypes))
	for _, a := range abilities.Archetypes {
		if AcademyUnlocked(a.ID, academyLevel, eliteLevel) {
			out = append(out, a)
		}
	}
	return out
}

// ResearchTier is the syllabus facility tier granted by the Coaching Department
// and Video Analysis levels (03 §2.1 vector 1), delegated to the abilities core
// so the campus and the ability gate share one mapping.
func ResearchTier(coachingLevel, videoLevel int) int {
	return abilities.FacilityTierForResearch(coachingLevel, videoLevel)
}

func clampRange(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
