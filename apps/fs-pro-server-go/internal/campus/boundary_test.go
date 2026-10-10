package campus

import (
	"math"
	"testing"
	"time"
)

// TestFacilityCurrencyMatchesSpec pins the full 04 §1.1 table. Before this
// test, the "Stands/Stadium (attendance)" row was missing, so a caller looking
// up that facility silently received the zero Currency (""). The map must
// resolve every facility the spec costs.
func TestFacilityCurrencyMatchesSpec(t *testing.T) {
	want := map[string]Currency{
		"turnstiles":      Fans, // Cash producer -> costs Fans
		"club_shop":       Cash, // Fans producer -> costs Cash
		"stands":          Cash, // attendance
		"stadium_grounds": Cash, // stadium
		"training_ground": Cash, // army: "Training Ground / Academy"
		"academy":         Cash,
		"coaching_dept":   Fans, // research
		"video_analysis":  Fans, // research
		"cash_vault":      Fans, // raises the Cash cap
		"fan_vault":       Cash, // raises the Fan cap
		"clubhouse":       Cash, // the hard gate
	}
	for facility, wantCurrency := range want {
		got, ok := FacilityCurrency[facility]
		if !ok {
			t.Errorf("%s missing from FacilityCurrency (04 §1.1)", facility)
			continue
		}
		if got != wantCurrency {
			t.Errorf("%s costs %s, want %s", facility, got, wantCurrency)
		}
	}
	if got := FacilityCurrency["missing_facility"]; got != "" {
		t.Errorf("unknown facility = %q, want zero Currency", got)
	}
}

func TestAccrueClampBoundaries(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	c := Collector{RatePerHour: 1000, Capacity: 5000}
	cases := []struct {
		name  string
		since time.Time
		want  float64
	}{
		{"zero elapsed", now, 0},
		{"future start (clock skew)", now.Add(time.Hour), 0},
		{"under cap", now.Add(-time.Hour), 1000},
		{"exactly at cap", now.Add(-5 * time.Hour), 5000},
		{"far over cap clamps", now.Add(-1000 * time.Hour), 5000},
		{"half hour is fractional", now.Add(-30 * time.Minute), 500},
	}
	for _, tc := range cases {
		if got := Accrue(c, tc.since, now); got != tc.want {
			t.Errorf("%s: Accrue = %v, want %v", tc.name, got, tc.want)
		}
	}
	// A zero-capacity collector never accrues.
	if got := Accrue(Collector{RatePerHour: 1000, Capacity: 0}, now.Add(-time.Hour), now); got != 0 {
		t.Errorf("zero-capacity accrual = %v, want 0", got)
	}
	// Backwards clock skew never yields a negative amount.
	if got := Accrue(c, now, now.Add(-time.Hour)); got != 0 {
		t.Errorf("backwards skew = %v, want 0", got)
	}
}

func TestVaultCapacityCurve(t *testing.T) {
	cases := []struct {
		base, growth float64
		level        int
		want         float64
	}{
		{10000, 2, -1, 0},
		{10000, 2, 0, 0},
		{10000, 2, 1, 10000},
		{10000, 2, 2, 20000},
		{10000, 2, 4, 80000},
		{10000, 1, 5, 10000}, // growth 1 is flat
	}
	for _, c := range cases {
		if got := VaultCapacity(c.base, c.growth, c.level); got != c.want {
			t.Errorf("VaultCapacity(%v,%v,%d) = %v, want %v", c.base, c.growth, c.level, got, c.want)
		}
	}
}

func TestUpgradeCostCurveIsSuperLinear(t *testing.T) {
	base, growth := 100.0, 2.0
	prev := -1.0
	for level := 1; level <= 8; level++ {
		got := UpgradeCost(base, growth, level)
		want := base * math.Pow(growth, float64(level-1))
		if math.Abs(got-want) > 1e-6 {
			t.Errorf("UpgradeCost level %d = %v, want %v", level, got, want)
		}
		if got <= prev {
			t.Errorf("cost curve not increasing at level %d: %v <= %v", level, got, prev)
		}
		prev = got
	}
	if got := UpgradeCost(base, growth, 1); got != base {
		t.Errorf("level 1 cost = %v, want base %v", got, base)
	}
}

func TestClubhouseRequirementsGraph(t *testing.T) {
	if reqs := ClubhouseRequirements(1); len(reqs) != 0 {
		t.Errorf("tier 1 is the start, want no requirements, got %v", reqs)
	}
	for tier := 2; tier <= MaxClubhouseTier; tier++ {
		if reqs := ClubhouseRequirements(tier); len(reqs) == 0 {
			t.Errorf("tier %d has no requirements", tier)
		}
	}
	if reqs := ClubhouseRequirements(MaxClubhouseTier + 1); reqs != nil {
		t.Errorf("tier above max should have no graph, got %v", reqs)
	}
	// A nil level map must not panic and must report every requirement missing.
	req3 := ClubhouseRequirements(3)
	if missing := MissingRequirements(3, nil); len(missing) != len(req3) {
		t.Errorf("nil levels: missing=%d, want %d", len(missing), len(req3))
	}
	// A partial campus must name exactly the missing prerequisite.
	ok, ms := CanUpgradeClubhouse(3, map[string]int{"stands": 2, "training_ground": 2})
	if ok || len(ms) != 1 || ms[0].Facility != "youth_academy" {
		t.Errorf("tier 3 partial: ok=%v missing=%v, want false / [youth_academy]", ok, ms)
	}
}

func TestCanStartUpgradeEdgeCases(t *testing.T) {
	if CanStartUpgrade(0, 0) {
		t.Error("no groundskeepers must refuse any upgrade")
	}
	if !CanStartUpgrade(0, MaxGroundskeepers) {
		t.Error("a fresh slot must be allowed")
	}
	if CanStartUpgrade(MaxGroundskeepers, MaxGroundskeepers) {
		t.Error("all slots busy must refuse")
	}
	if !CanStartUpgrade(5, 99) {
		t.Error("keeper count must cap at MaxGroundskeepers, allowing the 6th slot")
	}
	if CanStartUpgrade(6, 99) {
		t.Error("even with an inflated keeper count, 6 concurrent upgrades must be refused")
	}
}
