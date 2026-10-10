package league

import (
	"fmt"
	"testing"
	"time"
)

var fbBase = time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

// TestFormBonusEarnsAtFiveStars proves 5 stars within the window earn the bonus
// and reset the window (04 §5.3).
func TestFormBonusEarnsAtFiveStars(t *testing.T) {
	fb := FormBonus{}
	for i := 1; i <= 4; i++ {
		var earned bool
		fb, earned = fb.Accrue(fmt.Sprintf("raid-%d", i), fbBase.Add(time.Duration(i)*time.Minute), 1)
		if earned {
			t.Fatalf("bonus earned early at %d stars", i)
		}
		if got := fb.Stars(fbBase.Add(time.Duration(i) * time.Minute)); got != i {
			t.Fatalf("stars after %d accruals = %d, want %d", i, got, i)
		}
	}
	fb, earned := fb.Accrue("raid-5", fbBase.Add(5*time.Minute), 1)
	if !earned {
		t.Fatal("the 5th star must earn the Form Bonus")
	}
	if !fb.Ready() {
		t.Fatal("an earned bonus must report Ready")
	}
	// The window resets after the 5th star.
	if got := fb.Stars(fbBase.Add(5 * time.Minute)); got != 0 {
		t.Fatalf("stars after earning = %d, want 0 (window reset)", got)
	}
	if !FormBonusReady(5) || FormBonusReady(4) {
		t.Fatal("the audited FormBonusReady(int) contract must still hold")
	}
}

// TestFormBonusMultiStarRaid proves a single 3-star raid contributes 3 stars.
func TestFormBonusMultiStarRaid(t *testing.T) {
	fb := FormBonus{}
	fb, earned := fb.Accrue("r1", fbBase, 3)
	if earned {
		t.Fatal("3 stars must not earn the bonus alone")
	}
	fb, earned = fb.Accrue("r2", fbBase.Add(time.Hour), 3)
	if !earned {
		t.Fatal("3+3 stars in the window must earn the bonus")
	}
}

// TestFormBonusRollingWindow proves stars older than 24h stop counting.
func TestFormBonusRollingWindow(t *testing.T) {
	fb := FormBonus{}
	fb, _ = fb.Accrue("old", fbBase, 3)
	later := fbBase.Add(25 * time.Hour)
	fb, earned := fb.Accrue("new", later, 2)
	if earned {
		t.Fatal("the expired 3 stars must not combine with 2 new stars")
	}
	if got := fb.Stars(later); got != 2 {
		t.Fatalf("in-window stars = %d, want 2", got)
	}
}

// TestFormBonusIdempotentPerRaid proves re-processing the same raid is a no-op.
func TestFormBonusIdempotentPerRaid(t *testing.T) {
	fb := FormBonus{}
	fb, _ = fb.Accrue("r1", fbBase, 2)
	before := len(fb.Entries)
	fb, earned := fb.Accrue("r1", fbBase.Add(time.Minute), 2)
	if earned {
		t.Fatal("a duplicate raid must not earn the bonus")
	}
	if len(fb.Entries) != before {
		t.Fatalf("duplicate raid changed entries: %d -> %d", before, len(fb.Entries))
	}
}

func TestFormBonusNextResetAt(t *testing.T) {
	fb := FormBonus{}
	if fb.NextResetAt(fbBase) != nil {
		t.Fatal("an empty window has no reset time")
	}
	fb, _ = fb.Accrue("r1", fbBase, 1)
	fb, _ = fb.Accrue("r2", fbBase.Add(2*time.Hour), 1)
	got := fb.NextResetAt(fbBase.Add(2 * time.Hour))
	if got == nil {
		t.Fatal("expected a reset time")
	}
	want := fbBase.Add(FormBonusWindow)
	if !got.Equal(want) {
		t.Fatalf("NextResetAt = %s, want the oldest star + 24h = %s", got, want)
	}
}

func TestFormBonusLoot(t *testing.T) {
	if got := FormBonusLoot(125); got != FormBonusLootBase*125/100 {
		t.Errorf("FormBonusLoot(125) = %d", got)
	}
	if got := FormBonusLoot(0); got != 0 {
		t.Errorf("FormBonusLoot(0) = %d, want 0", got)
	}
}

func TestFormBonusClaim(t *testing.T) {
	fb := FormBonus{}
	for i := 0; i < 5; i++ {
		fb, _ = fb.Accrue("r"+string(rune('a'+i)), fbBase.Add(time.Duration(i)*time.Second), 1)
	}
	if !fb.Ready() {
		t.Fatal("expected the bonus to be ready")
	}
	claimed := fb.Claim()
	if claimed.Ready() {
		t.Fatal("a claimed bonus must not report Ready")
	}
}
