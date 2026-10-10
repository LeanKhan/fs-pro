package league

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

// Weekly tournament pools and the reset cadence (docs/coc-mapping/04 §4.3, 02
// §H). Pure so the rules are table-testable; repository.go wires them to
// Postgres and the world-worker ticker drives the rollover.

// PoolSize is the weekly tournament pool size (04 §4.3, "a pool of ~100
// clubs").
const PoolSize = 100

// Code is the stable database code for a rung. It matches the 0048_ladder
// seed exactly: the lower-cased name plus the division ("bronze_3"), or just
// the name for the single-division apex / unranked ("legend", "unranked").
func (l League) Code() string {
	if l.Division == 0 {
		return strings.ToLower(l.Name)
	}
	return fmt.Sprintf("%s_%d", strings.ToLower(l.Name), l.Division)
}

// LeagueByCode resolves a rung code back to its index in Leagues, or -1 when
// the code is unknown (e.g. the synthetic "unranked").
func LeagueByCode(code string) int {
	for i, l := range Leagues {
		if l.Code() == code {
			return i
		}
	}
	return -1
}

// ApexIndex is the index of the single-division apex (Legend) in Leagues.
func ApexIndex() int { return len(Leagues) - 1 }

// IsApex reports whether a rung index is the apex. The apex resets monthly;
// every other rung resets weekly (04 §4.3).
func IsApex(index int) bool { return index == ApexIndex() }

// ResetFloor is the Standing a rung resets to at a cadence boundary: the
// rung's lower bound (04 §4.2). Out-of-range indices reset to 0 (unranked).
func ResetFloor(index int) int {
	if index < 0 || index >= len(Leagues) {
		return 0
	}
	return Leagues[index].LowerBound
}

// PoolsNeeded is how many pools `n` signed-up clubs fill.
func PoolsNeeded(n int) int {
	if n <= 0 {
		return 0
	}
	return (n + PoolSize - 1) / PoolSize
}

// NextPoolIndex chooses the pool a new signup joins: the lowest-indexed pool
// that still has room, or a freshly opened pool when all are full. `fill` is
// the current member count per existing pool. Pure and deterministic, so the
// same signup state always assigns the same pool.
func NextPoolIndex(fill []int) int {
	for i, n := range fill {
		if n < PoolSize {
			return i
		}
	}
	return len(fill)
}

// PoolEntry is one club's weekly pool contribution.
type PoolEntry struct {
	ClubID string
	Stars  int
}

// Placement ranks every entry by Stars descending, breaking ties by ClubID so
// the outcome is deterministic regardless of row order. It returns each club's
// 1-based placement (1 = best).
func Placement(entries []PoolEntry) map[string]int {
	ordered := make([]PoolEntry, len(entries))
	copy(ordered, entries)
	sort.SliceStable(ordered, func(i, j int) bool {
		if ordered[i].Stars != ordered[j].Stars {
			return ordered[i].Stars > ordered[j].Stars
		}
		return ordered[i].ClubID < ordered[j].ClubID
	})
	out := make(map[string]int, len(ordered))
	for i, e := range ordered {
		out[e.ClubID] = i + 1
	}
	return out
}

// Placement outcomes written to StandingResults.
const (
	OutcomePromoted  = "promoted"
	OutcomeRelegated = "relegated"
	OutcomeHeld      = "held"
)

// PlacementOutcome maps a 1-based placement in a pool of `poolSize` to a rung
// move: the top PromoteRelegate(poolSize) promote one rung, the bottom
// relegate one rung, everyone else holds. Promotion/relegation is at most one
// rung (04 §4.3, "no skip"); the apex cannot be promoted and the lowest rung
// cannot be relegated further. A pool too small to place anyone holds.
func PlacementOutcome(index, placement, poolSize int) (newIndex int, outcome string) {
	if poolSize <= 0 || placement < 1 || placement > poolSize || index >= ApexIndex() {
		return index, OutcomeHeld
	}
	promote, relegate := PromoteRelegate(poolSize)
	if promote == 0 && relegate == 0 {
		return index, OutcomeHeld
	}
	if placement <= promote {
		if index < 0 {
			return 0, OutcomePromoted
		}
		return index + 1, OutcomePromoted
	}
	if placement > poolSize-relegate {
		if index <= 0 {
			return index, OutcomeHeld
		}
		return index - 1, OutcomeRelegated
	}
	return index, OutcomeHeld
}

// WeekKey is the ISO-8601 week key ("2026-W41") in UTC. It is the weekly
// ladder's identity; lexicographic order matches chronological order.
func WeekKey(t time.Time) string {
	year, week := t.UTC().ISOWeek()
	return fmt.Sprintf("%04d-W%02d", year, week)
}

// MonthKey is the real-time calendar month key ("2026-10") the apex resets on
// (04 §12: the player-facing season is the real-time month).
func MonthKey(t time.Time) string {
	return t.UTC().Format("2006-01")
}

// PreviousWeekKey is the week key one week before t.
func PreviousWeekKey(t time.Time) string { return WeekKey(t.UTC().AddDate(0, 0, -7)) }

// PreviousMonthKey is the month key one month before t.
func PreviousMonthKey(t time.Time) string { return MonthKey(t.UTC().AddDate(0, -1, 0)) }
