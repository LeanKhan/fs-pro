package league

import "time"

// Form Bonus (docs/coc-mapping/04 §5.3, 02 §I): a club that earns FormBonusStars
// stars within a rolling FormBonusWindow gets bonus loot into its Board Vault;
// the window resets after the 5th star. Pure, so the window rules are
// table-testable; repository.go persists the state and credits the loot.

const (
	// FormBonusStars is the star count that earns the Form Bonus.
	FormBonusStars = 5
	// FormBonusWindow is the rolling window the stars must fall within.
	FormBonusWindow = 24 * time.Hour
	// FormBonusLootBase is the system-paid Cash granted (before the league
	// multiplier) when the Form Bonus is earned. Content - tunable.
	FormBonusLootBase = 30_000
)

// FormBonusLoot scales the base Form Bonus by a league multiplier expressed
// x100 (04 §4.2: the ladder has economic teeth).
func FormBonusLoot(multiplierX100 int) int {
	if multiplierX100 <= 0 {
		return 0
	}
	return FormBonusLootBase * multiplierX100 / 100
}

// FormBonusEntry is one raid's contribution to the rolling window. RaidID makes
// accrual idempotent: re-processing the same raid is a no-op.
type FormBonusEntry struct {
	RaidID string    `json:"raidId"`
	At     time.Time `json:"at"`
	Stars  int       `json:"stars"`
}

// FormBonus is the rolling-window state. Entries older than the window no longer
// count; when the in-window total reaches FormBonusStars the bonus is earned,
// EarnedAt is stamped for the claim, and the window resets (Entries is cleared).
type FormBonus struct {
	Entries  []FormBonusEntry
	EarnedAt *time.Time
	Credited int
}

// inWindow reports whether an entry still counts at now (strictly newer than
// the 24h cutoff).
func inWindow(at, now time.Time) bool {
	return at.After(now.Add(-FormBonusWindow))
}

// Accrue adds a raid's stars to the window. It is idempotent per RaidID. It
// returns the new state and whether this call completed the Form Bonus.
func (f FormBonus) Accrue(raidID string, at time.Time, stars int) (FormBonus, bool) {
	at = at.UTC()
	if stars < 0 {
		stars = 0
	}
	if stars > 3 {
		stars = 3
	}
	for _, e := range f.Entries {
		if e.RaidID == raidID {
			return f, false
		}
	}
	out := FormBonus{EarnedAt: f.EarnedAt, Credited: f.Credited}
	total := 0
	for _, e := range f.Entries {
		if inWindow(e.At, at) {
			out.Entries = append(out.Entries, e)
			total += e.Stars
		}
	}
	if stars > 0 {
		out.Entries = append(out.Entries, FormBonusEntry{RaidID: raidID, At: at, Stars: stars})
		total += stars
	}
	if total >= FormBonusStars {
		earned := at
		out.EarnedAt = &earned
		out.Entries = nil // the window resets after the 5th star
		return out, true
	}
	return out, false
}

// Stars is the in-window star total at now (0..FormBonusStars-1 when unearned).
func (f FormBonus) Stars(now time.Time) int {
	total := 0
	for _, e := range f.Entries {
		if inWindow(e.At, now) {
			total += e.Stars
		}
	}
	return total
}

// Ready reports whether the Form Bonus has been earned and not yet claimed.
func (f FormBonus) Ready() bool { return f.EarnedAt != nil }

// Claim clears the earned flag after the loot has been credited, leaving the
// current window intact.
func (f FormBonus) Claim() FormBonus {
	return FormBonus{Entries: f.Entries, EarnedAt: nil, Credited: f.Credited}
}

// NextResetAt is when the oldest in-window star ages out of the window, or nil
// when the window is empty.
func (f FormBonus) NextResetAt(now time.Time) *time.Time {
	var oldest time.Time
	for _, e := range f.Entries {
		if !inWindow(e.At, now) {
			continue
		}
		if oldest.IsZero() || e.At.Before(oldest) {
			oldest = e.At
		}
	}
	if oldest.IsZero() {
		return nil
	}
	t := oldest.Add(FormBonusWindow)
	return &t
}
