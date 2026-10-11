package legacy

import (
	"testing"

	"fs-pro-server/internal/seasonpass"
)

func TestHonoursCatalogueWellFormed(t *testing.T) {
	if len(Honours) < 4 {
		t.Fatalf("honours catalogue = %d, want >= 4", len(Honours))
	}
	seen := map[string]bool{}
	for _, h := range Honours {
		if h.Code == "" || h.Title == "" {
			t.Errorf("honour %+v missing code/title", h)
		}
		if h.Goal < 1 {
			t.Errorf("honour %s goal = %d, want >= 1", h.Code, h.Goal)
		}
		if seen[h.Code] {
			t.Errorf("duplicate honour code %q", h.Code)
		}
		seen[h.Code] = true
		rw := h.Reward
		if rw.Cash == 0 && rw.Fans == 0 && rw.SponsorCredits == 0 && len(rw.Perks) == 0 {
			t.Errorf("honour %s grants nothing", h.Code)
		}
		for id := range rw.Perks {
			if _, ok := seasonpass.PerkDefFor(id); !ok {
				t.Errorf("honour %s grants unknown perk %q", h.Code, id)
			}
		}
		if _, ok := HonourFor(h.Code); !ok {
			t.Errorf("HonourFor(%s) not found", h.Code)
		}
	}
	if _, ok := HonourFor("nope"); ok {
		t.Error("HonourFor must reject an unknown code")
	}
}

// TestLegacyHonourRewardIsSponsorOnlyOrRegalia guards the premium philosophy:
// no Honour grants trait alloys, ability tiers or match power (only currency,
// Fans and cosmetic/consumable Perks) - 04 §9.
func TestLegacyHonourRewardIsSponsorOnlyOrRegalia(t *testing.T) {
	for _, h := range Honours {
		if h.Reward.Cash < 0 || h.Reward.Fans < 0 || h.Reward.SponsorCredits < 0 {
			t.Errorf("honour %s has a negative reward", h.Code)
		}
	}
}
