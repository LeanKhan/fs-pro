package abilities

import "testing"

func TestArchetypeCatalogValid(t *testing.T) {
	seen := map[string]bool{}
	for _, a := range Archetypes {
		if a.ID == "" || a.Name == "" {
			t.Errorf("archetype %+v needs an id and name", a)
		}
		if seen[a.ID] {
			t.Errorf("duplicate archetype id %q", a.ID)
		}
		seen[a.ID] = true
		if a.SlotCost < 1 {
			t.Errorf("archetype %s slot cost %d < 1", a.ID, a.SlotCost)
		}
		if a.AcademyLevel < 1 {
			t.Errorf("archetype %s academy level %d < 1", a.ID, a.AcademyLevel)
		}
		if a.Family != FamilyGK && a.Family != FamilyDEF && a.Family != FamilyMID && a.Family != FamilyATT && a.Family != FamilyALL {
			t.Errorf("archetype %s has undeclared family %q", a.ID, a.Family)
		}
	}
}

func TestSlotCostOf(t *testing.T) {
	cases := []struct {
		id       string
		star     int
		wantCost int
		wantOK   bool
	}{
		{"swarm", 0, 1, true},
		{"anchor", 0, 3, true},
		{"anchor", 1, 4, true},
		{"anchor", MaxStarTier, 6, true},
		{"anchor", 99, 6, true}, // clamped
		{"anchor", -5, 3, true},
		{"keeper", 2, 4, true},
		{"nope", 0, 0, false},
	}
	for _, c := range cases {
		cost, ok := SlotCostOf(c.id, c.star)
		if ok != c.wantOK || cost != c.wantCost {
			t.Errorf("SlotCostOf(%q,%d) = (%d,%v), want (%d,%v)", c.id, c.star, cost, ok, c.wantCost, c.wantOK)
		}
	}
}

func TestArchetypeForPlayer(t *testing.T) {
	cases := []struct {
		position, role string
		want           string
	}{
		{"", "Anchor", "anchor"}, // archetype alias
		{"", "flank rusher", "flank_rusher"},
		{"", "FLANKRUSHER", "flank_rusher"},
		{"", "CDM", "anchor"}, // sim-core role alias
		{"", "CAM", "infiltrator"},
		{"", "ST", "sniper"},
		{"", "CM", "swarm"},
		{"DEF", "", "anchor"}, // position bucket fallback
		{"MID", "", "sniper"},
		{"ATT", "", "flank_rusher"},
		{"GK", "", "keeper"},
		{"MID", "CB", "anchor"}, // role wins over position
		{"", "", "swarm"},       // unknown -> cheapest
		{"WEIRD", "NONSENSE", "swarm"},
	}
	for _, c := range cases {
		if got := ArchetypeForPlayer(c.position, c.role).ID; got != c.want {
			t.Errorf("ArchetypeForPlayer(%q,%q).ID = %q, want %q", c.position, c.role, got, c.want)
		}
	}
}

func TestArchetypeForPosition(t *testing.T) {
	if got := ArchetypeForPosition("GK").ID; got != "keeper" {
		t.Errorf("GK position = %q, want keeper", got)
	}
	if got := ArchetypeForPosition("unknown").ID; got != "swarm" {
		t.Errorf("unknown position = %q, want swarm", got)
	}
}

func TestFamilyForPosition(t *testing.T) {
	cases := map[string]Family{
		"GK": FamilyGK, "DEF": FamilyDEF, "MID": FamilyMID, "ATT": FamilyATT,
		"": FamilyALL, "weird": FamilyALL,
	}
	for pos, want := range cases {
		if got := FamilyForPosition(pos); got != want {
			t.Errorf("FamilyForPosition(%q) = %s, want %s", pos, got, want)
		}
	}
	// The syllabus family is positional, independent of the housing archetype:
	// a CM is a cheap Swarm archetype but still a MID syllabus player.
	if a := ArchetypeForPlayer("MID", "CM"); a.ID != "swarm" {
		t.Errorf("MID/CM archetype = %s, want swarm", a.ID)
	}
	if got := FamilyForPosition("MID"); got != FamilyMID {
		t.Errorf("MID family = %s, want MID", got)
	}
}
