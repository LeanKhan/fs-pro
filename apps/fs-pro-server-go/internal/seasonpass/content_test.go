package seasonpass

import (
	"testing"
	"time"
)

func TestSeasonKeyFor(t *testing.T) {
	at := time.Date(2026, 10, 10, 23, 59, 0, 0, time.UTC)
	if got := SeasonKeyFor(at); got != "2026-10" {
		t.Errorf("SeasonKeyFor = %q, want 2026-10", got)
	}
	// A non-UTC instant is normalized to UTC before formatting.
	loc := time.FixedZone("UTC+2", 2*3600)
	if got := SeasonKeyFor(time.Date(2026, 11, 1, 0, 30, 0, 0, loc)); got != "2026-10" {
		t.Errorf("SeasonKeyFor(UTC+2 midnight) = %q, want 2026-10", got)
	}
}

func TestSeasonEndAndBankClaimOpen(t *testing.T) {
	start, err := SeasonStart("2026-09")
	if err != nil {
		t.Fatal(err)
	}
	if !start.Equal(time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("SeasonStart = %v", start)
	}
	end, err := SeasonEnd("2026-09")
	if err != nil {
		t.Fatal(err)
	}
	if !end.Equal(time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("SeasonEnd = %v, want 2026-10-01T00:00Z", end)
	}
	// December rolls into the next year.
	decEnd, err := SeasonEnd("2026-12")
	if err != nil || !decEnd.Equal(time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("SeasonEnd(2026-12) = %v/%v", decEnd, err)
	}

	if BankClaimOpen("2026-09", end.Add(-time.Second)) {
		t.Error("bank must not be claimable one second before season end")
	}
	if !BankClaimOpen("2026-09", end) {
		t.Error("bank must be claimable exactly at season end")
	}
	if !BankClaimOpen("2026-09", end.Add(48*time.Hour)) {
		t.Error("bank must stay claimable after season end")
	}
	// A malformed key is never claimable.
	if BankClaimOpen("not-a-month", end) {
		t.Error("a malformed season key must never be claimable")
	}
	if _, err := SeasonEnd("nope"); err == nil {
		t.Error("SeasonEnd should reject a malformed key")
	}
}

func TestObjectiveCatalogueResolution(t *testing.T) {
	if len(Objectives) < 6 {
		t.Fatalf("objective catalogue = %d, want >= 6", len(Objectives))
	}
	seen := map[string]bool{}
	shared := 0
	for i, o := range Objectives {
		if o.Code == "" || o.Title == "" {
			t.Errorf("objective %d missing code/title", i)
		}
		if o.Points <= 0 || o.Goal <= 0 {
			t.Errorf("objective %s must have positive points/goal", o.Code)
		}
		if seen[o.Code] {
			t.Errorf("duplicate objective code %q", o.Code)
		}
		seen[o.Code] = true
		if o.Scope != ScopeIndividual && o.Scope != ScopeShared {
			t.Errorf("objective %s has unknown scope %q", o.Code, o.Scope)
		}
		if o.Scope == ScopeShared {
			shared++
		}
		if got := ObjectiveOrdinal(o.Code); got != i+1 {
			t.Errorf("ObjectiveOrdinal(%s) = %d, want %d", o.Code, got, i+1)
		}
	}
	if shared == 0 {
		t.Error("the catalogue must include at least one shared objective (04 §6)")
	}

	first := Objectives[0]
	if o, ok := ObjectiveFor(first.Code); !ok || o.Code != first.Code {
		t.Errorf("ObjectiveFor(%s) = %v/%v", first.Code, o, ok)
	}
	if o, ok := ObjectiveFor("1"); !ok || o.Code != first.Code {
		t.Errorf("ObjectiveFor ordinal 1 = %v/%v", o, ok)
	}
	if _, ok := ObjectiveFor("nope"); ok {
		t.Error("ObjectiveFor must reject an unknown id")
	}
	if _, ok := ObjectiveFor("0"); ok {
		t.Error("ObjectiveFor ordinal 0 must be rejected")
	}
	if o, ok := ObjectiveByOrdinal(len(Objectives)); !ok || o.Code != Objectives[len(Objectives)-1].Code {
		t.Errorf("ObjectiveByOrdinal(last) = %v/%v", o, ok)
	}
	if _, ok := ObjectiveByOrdinal(len(Objectives) + 1); ok {
		t.Error("ObjectiveByOrdinal out of range must fail")
	}
}

func TestTierRewardGates(t *testing.T) {
	if _, ok := TierReward(Track("platinum"), 5); ok {
		t.Error("an unknown track must never grant a reward")
	}
	if _, ok := TierReward(Track(""), 5); ok {
		t.Error("an empty track must never grant a reward")
	}
	silver, ok := TierReward(Silver, 3)
	if !ok || silver.IsZero() {
		t.Errorf("Silver tier 3 reward = %+v/%v", silver, ok)
	}
	gold, ok := TierReward(Gold, 3)
	if !ok || gold.IsZero() {
		t.Errorf("Gold tier 3 reward = %+v/%v", gold, ok)
	}
	if gold.Cash <= silver.Cash || gold.Fans <= silver.Fans {
		t.Errorf("Gold must be richer than Silver: gold %+v silver %+v", gold, silver)
	}
}

func TestTierRewardCurve(t *testing.T) {
	// Zero/negative tiers grant nothing.
	if !SilverReward(0).IsZero() || !GoldReward(-1).IsZero() {
		t.Error("tier <= 0 must grant nothing")
	}
	// Rewards are monotonic in tier.
	prevS, prevG := SilverReward(1).Cash, GoldReward(1).Cash
	for tier := 2; tier <= MaxTier(); tier++ {
		s, g := SilverReward(tier).Cash, GoldReward(tier).Cash
		if s <= prevS || g <= prevG {
			t.Fatalf("reward not monotonic at tier %d (silver %.0f->%.0f, gold %.0f->%.0f)", tier, prevS, s, prevG, g)
		}
		prevS, prevG = s, g
	}
	// The premium track grants Sponsor Credits only at milestone tiers, and the
	// free track never grants premium currency (04 §9: premium buys time, not power).
	for tier := 1; tier <= MaxTier(); tier++ {
		if SilverReward(tier).SponsorCredits != 0 {
			t.Errorf("Silver tier %d must not grant Sponsor Credits", tier)
		}
	}
	if GoldReward(5).SponsorCredits == 0 {
		t.Error("Gold milestone tiers should grant Sponsor Credits")
	}
}

func TestPerkCatalogue(t *testing.T) {
	if len(Perks) < 5 {
		t.Fatalf("perk catalogue = %d, want >= 5", len(Perks))
	}
	seen := map[string]bool{}
	for _, p := range Perks {
		if p.ID == "" || p.Name == "" || p.Category == "" {
			t.Errorf("perk %+v missing a field", p)
		}
		if seen[p.ID] {
			t.Errorf("duplicate perk id %q", p.ID)
		}
		seen[p.ID] = true
		if _, ok := PerkDefFor(p.ID); !ok {
			t.Errorf("PerkDefFor(%s) not found", p.ID)
		}
	}
	if _, ok := PerkDefFor("nope"); ok {
		t.Error("PerkDefFor must reject an unknown perk")
	}
	if PassPriceCredits <= 0 {
		t.Error("PassPriceCredits must be positive")
	}
}

// TestBankAccrualPure locks the exactly-once math used by the repository.
func TestBankAccrualPure(t *testing.T) {
	if got := BankAccrual(1000, BankShareBp); got != 200 {
		t.Errorf("BankAccrual(1000, %d) = %d, want 200", BankShareBp, got)
	}
	// Tiny incomes whose share rounds to zero bank nothing (and the source is
	// not recorded, so a later call with a real income can still bank).
	if got := BankAccrual(1, 2000); got != 0 {
		t.Errorf("BankAccrual(1, 2000) = %d, want 0", got)
	}
}
