package campus

import (
	"strings"
	"testing"

	"fs-pro-server/internal/abilities"
)

// legalSquad is a canonical 4-4-2: GK, two anchors, two flank-backs, two swarms,
// one infiltrator, two flank-rushers, one sniper. It is the squad the PLAY gate
// must still accept once the capacity check is wired in.
func legalSquad() []SquadMember {
	return []SquadMember{
		{Archetype: "keeper"},
		{Archetype: "anchor"}, {Archetype: "anchor"},
		{Archetype: "flank_rusher"}, {Archetype: "flank_rusher"},
		{Archetype: "swarm"}, {Archetype: "swarm"},
		{Archetype: "infiltrator"},
		{Archetype: "flank_rusher"}, {Archetype: "flank_rusher"},
		{Archetype: "sniper"},
	}
}

func TestSquadCapacity(t *testing.T) {
	cases := []struct {
		camp, tier, want int
	}{
		{0, 1, SquadCampBaseCapacity},
		{1, 1, SquadCampBaseCapacity + SquadCampCapacityPerLevel},
		{0, 2, SquadCampBaseCapacity + SquadCampCapacityPerTier},
		{5, 5, SquadCampBaseCapacity + 5*SquadCampCapacityPerLevel + 4*SquadCampCapacityPerTier},
		{99, 99, 30 + 5*5 + 4*3}, // clamped high
		{-1, 0, SquadCampBaseCapacity},
	}
	for _, c := range cases {
		if got := SquadCapacity(c.camp, c.tier); got != c.want {
			t.Errorf("SquadCapacity(%d,%d) = %d, want %d", c.camp, c.tier, got, c.want)
		}
	}
}

func TestSquadUsage(t *testing.T) {
	used, unknown := SquadUsage(legalSquad())
	if unknown != "" {
		t.Fatalf("unexpected unknown archetype %q", unknown)
	}
	// keeper2 + anchor3+3 + flank2+2 + swarm1+1 + infiltrator2 + flank2+2 + sniper3
	if used != 23 {
		t.Errorf("legal squad usage = %d, want 23", used)
	}
	if _, unknown := SquadUsage([]SquadMember{{Archetype: "ghost"}}); unknown != "ghost" {
		t.Errorf("unknown archetype = %q, want ghost", unknown)
	}
}

func TestSquadProblemReasons(t *testing.T) {
	// A legal squad at the tier-1 start fits: the check is additive and must not
	// break gate.go's behaviour for legal squads.
	if p := SquadCampGateProblem(legalSquad(), 0, 1); p != nil {
		t.Fatalf("legal squad must fit at camp 0 / tier 1, got %+v", p)
	}

	// Eleven anchors use 33 slots > the 30-slot base: blocked with a clear reason.
	heavy := make([]SquadMember, 11)
	for i := range heavy {
		heavy[i] = SquadMember{Archetype: "anchor"}
	}
	p := SquadCampGateProblem(heavy, 0, 1)
	if p == nil || p.Code != "squad_over_capacity" {
		t.Fatalf("heavy squad = %+v, want squad_over_capacity", p)
	}
	for _, want := range []string{"33", "30", "trim 3"} {
		if !strings.Contains(p.Message, want) {
			t.Errorf("reason %q should mention %q", p.Message, want)
		}
	}

	// An unknown archetype is reported, never silently charged.
	if p := SquadProblem([]SquadMember{{Archetype: "ghost"}}, 30); p == nil || p.Code != "unknown_archetype" {
		t.Fatalf("unknown archetype = %+v, want unknown_archetype", p)
	}

	// A star surcharge can tip a squad over.
	stars := make([]SquadMember, 11)
	for i := range stars {
		stars[i] = SquadMember{Archetype: "anchor", StarTier: abilities.MaxStarTier}
	}
	if p := SquadProblem(stars, 30); p == nil {
		t.Error("eleven tier-3 anchors must not fit 30 slots")
	}
}

func TestSquadCapacityRaisesWithCampus(t *testing.T) {
	heavy := make([]SquadMember, 11)
	for i := range heavy {
		heavy[i] = SquadMember{Archetype: "anchor"}
	}
	// 33 slots: fits once the Squad Camp reaches level 1 (35) or the Clubhouse
	// tier adds enough (30 + 3*tier; tier 2 => 33).
	if p := SquadCampGateProblem(heavy, 1, 1); p != nil {
		t.Errorf("camp level 1 raises the cap to 35: %+v", p)
	}
	if p := SquadCampGateProblem(heavy, 0, 2); p != nil {
		t.Errorf("clubhouse tier 2 raises the cap to 33: %+v", p)
	}
}

func TestAcademyUnlocks(t *testing.T) {
	// At Academy 1 + no Elite Academy, only the level-1 archetypes are fieldable.
	got := UnlockedArchetypes(1, 0)
	ids := map[string]bool{}
	for _, a := range got {
		ids[a.ID] = true
	}
	if !ids["keeper"] || !ids["swarm"] {
		t.Errorf("Academy 1 should unlock keeper + swarm: %v", ids)
	}
	if ids["anchor"] || ids["talisman"] {
		t.Errorf("Academy 1 must not unlock anchor/talisman: %v", ids)
	}
	// The Talisman is elite: it needs both Academy 4 and the Elite Academy.
	if AcademyUnlocked("talisman", 4, 0) {
		t.Error("talisman must require the Elite Academy")
	}
	if !AcademyUnlocked("talisman", 4, 1) {
		t.Error("talisman should unlock at Academy 4 + Elite Academy")
	}
	if AcademyUnlocked("nope", 5, 1) {
		t.Error("unknown archetype must not unlock")
	}
	if len(UnlockedArchetypes(5, 1)) != len(abilities.Archetypes) {
		t.Error("Academy 5 + Elite should unlock every archetype")
	}
}

func TestResearchTierDelegates(t *testing.T) {
	if got := ResearchTier(3, 2); got != 5 {
		t.Errorf("ResearchTier(3,2) = %d, want 5", got)
	}
	if got := ResearchTier(1, 0); got != 1 {
		t.Errorf("ResearchTier(1,0) = %d, want 1", got)
	}
}
