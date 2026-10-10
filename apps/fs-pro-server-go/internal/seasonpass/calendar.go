package seasonpass

import (
	"fmt"
	"time"
)

// This file holds the *time* rules of the monthly season (docs/coc-mapping/04
// §6, §12): the season is the real-time calendar month and the Season Bank is
// claimed at the month's end. Kept pure so the boundaries are table-testable
// and the caller (handlers, worker) always injects `now`.

// SeasonKeyFor is the real-time calendar-month key: "2006-01" (04 §12 rule 1).
func SeasonKeyFor(t time.Time) string { return t.UTC().Format("2006-01") }

// ParseSeasonKey parses a "YYYY-MM" season key into its UTC month start.
func ParseSeasonKey(key string) (time.Time, error) {
	t, err := time.ParseInLocation("2006-01", key, time.UTC)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid season key %q", key)
	}
	return t, nil
}

// SeasonStart is the first instant of the season's month (UTC).
func SeasonStart(key string) (time.Time, error) { return ParseSeasonKey(key) }

// SeasonEnd is the first instant of the month *after* the season (UTC): the
// moment the Season Bank becomes claimable (04 §6).
func SeasonEnd(key string) (time.Time, error) {
	t, err := ParseSeasonKey(key)
	if err != nil {
		return time.Time{}, err
	}
	return t.AddDate(0, 1, 0), nil
}

// BankClaimOpen reports whether the Season Bank may be claimed at `now`. The
// bank accrues during the month and is only claimable once the season has
// ended (04 §6). A malformed key is never claimable.
func BankClaimOpen(key string, now time.Time) bool {
	end, err := SeasonEnd(key)
	if err != nil {
		return false
	}
	return !now.UTC().Before(end)
}
