package play

import (
	"strconv"
	"sync"

	"fs-pro-server/internal/metrics"
)

// Play observability metrics (docs/coc-mapping/05 §9, 04 §11, 06 KPIs). These
// are the raid KPIs: attempts, how raids resolve, the attacker win-rate and
// which grid a raid was played with.
var (
	raidAttempts = metrics.Default().Counter(
		"fspro_raid_attempts_total",
		"Player-initiated PLAY raids that reached the raid layer.")
	defenseFailures = metrics.Default().Counter(
		"fspro_defense_raids_failed_total",
		"Pending raids the defense worker marked failed.")
)

var (
	raidResolutionCounters sync.Map // path -> *metrics.Counter
	raidOutcomeCounters    sync.Map // outcome -> *metrics.Counter
	raidStarCounters       sync.Map // stars -> *metrics.Counter
	gridUsageCounters      sync.Map // slot -> *metrics.Counter
)

// recordRaidAttempt counts one player-initiated raid attempt.
func recordRaidAttempt() { raidAttempts.Inc() }

// recordRaidResolution counts a resolved raid by the path that resolved it.
func recordRaidResolution(path string) { raidResolutionCounter(path).Inc() }

// recordRaidOutcome counts an attacker-perspective raid result.
func recordRaidOutcome(outcome string) { raidOutcomeCounter(outcome).Inc() }

// recordRaidStars counts the earned star rating.
func recordRaidStars(stars int) { raidStarCounter(strconv.Itoa(stars)).Inc() }

// recordGridUsage counts a stored layout slot used to raid.
func recordGridUsage(slot string) { gridUsageCounter(slot).Inc() }

// recordDefenseFailure counts a pending raid that failed to resolve.
func recordDefenseFailure() { defenseFailures.Inc() }

func labeledCounter(m *sync.Map, name, help, labelKey, labelValue string) *metrics.Counter {
	if v, ok := m.Load(labelValue); ok {
		return v.(*metrics.Counter)
	}
	c := metrics.Default().CounterLabel(name, help, labelKey, labelValue)
	actual, _ := m.LoadOrStore(labelValue, c)
	return actual.(*metrics.Counter)
}

func raidResolutionCounter(path string) *metrics.Counter {
	return labeledCounter(&raidResolutionCounters,
		"fspro_raid_resolutions_total",
		"Resolved raids by path: attack (inline PLAY) or defense (offline worker).",
		"path", path)
}

func raidOutcomeCounter(outcome string) *metrics.Counter {
	return labeledCounter(&raidOutcomeCounters,
		"fspro_raid_outcomes_total",
		"Resolved ranked raids by attacker-perspective outcome (win|draw|loss).",
		"outcome", outcome)
}

func raidStarCounter(stars string) *metrics.Counter {
	return labeledCounter(&raidStarCounters,
		"fspro_raid_stars_total",
		"Resolved raids by earned star rating (0-3).",
		"stars", stars)
}

func gridUsageCounter(slot string) *metrics.Counter {
	return labeledCounter(&gridUsageCounters,
		"fspro_grid_usage_total",
		"Grid layouts used in a raid, by slot (home defends, match attacks).",
		"slot", slot)
}
