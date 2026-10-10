package campus

import (
	"math"
	"strconv"
	"strings"
	"time"
)

// This file extends the pure campus core (docs/coc-mapping/04 §3) with the
// pieces the P1 HTTP/storage layer needs and that the Batch 0 audit flagged as
// missing: the exponential upgrade *time* curve, a Clubhouse-tier factor on
// vault capacity, and a GAME_TIME_SCALE-aware collector accrual. Everything
// here is pure and table-testable.

// UpgradeTime is the build time in minutes for target level `level`:
// baseMinutes * timeGrowth^(level-1) (04 §3.2). Level <= 1 is the base. The
// caller scales by GAME_TIME_SCALE with UpgradeMinutesScaled.
func UpgradeTime(baseMinutes, timeGrowth float64, level int) float64 {
	if level <= 1 {
		return baseMinutes
	}
	return baseMinutes * math.Pow(timeGrowth, float64(level-1))
}

// UpgradeMinutesScaled is UpgradeTime compressed by GAME_TIME_SCALE (04 §3.2):
// a larger scale means game time runs faster, so the real-clock build time is
// the curve divided by the scale. An unset/invalid/non-positive scale is 1.
func UpgradeMinutesScaled(baseMinutes, timeGrowth float64, level int, scale float64) float64 {
	if scale <= 0 {
		scale = 1
	}
	return UpgradeTime(baseMinutes, timeGrowth, level) / scale
}

// GameTimeScale parses a GAME_TIME_SCALE value (already read from the
// environment by the caller, so this stays pure). Anything at or below 0.01 or
// unparseable falls back to 1, matching internal/facilities.gameTimeScale.
func GameTimeScale(raw string) float64 {
	if v := strings.TrimSpace(raw); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f >= 0.01 {
			return f
		}
	}
	return 1
}

// VaultCapacityForTier is a vault level's capacity with the Clubhouse-tier
// factor 04 §3.3 specifies ("capacity scales with vault level and Clubhouse
// tier"). The level drives the growth curve; the tier adds 5% per tier above 1.
func VaultCapacityForTier(base, growth float64, level, clubhouseTier int) float64 {
	if level <= 0 {
		return 0
	}
	if clubhouseTier < 1 {
		clubhouseTier = 1
	}
	tierFactor := 1 + 0.05*float64(clubhouseTier-1)
	return VaultCapacity(base, growth, level) * tierFactor
}

// AccrueScaled is Accrue with GAME_TIME_SCALE applied (04 §3.1 "the daemon must
// respect it"): the elapsed game-hours are real hours * scale, clamped to the
// capacity. A non-positive scale is treated as 1.
func AccrueScaled(c Collector, since, now time.Time, scale float64) float64 {
	if scale <= 0 {
		scale = 1
	}
	hours := now.Sub(since).Hours() * scale
	if hours <= 0 {
		return 0
	}
	v := c.RatePerHour * hours
	if v > c.Capacity {
		return c.Capacity
	}
	return v
}

// ---------------------------------------------------------------------------
// Economy facility configuration (the campus.* routes' buildable set).
// ---------------------------------------------------------------------------

// MaxFacilityLevel is the highest level of a campus economy facility.
const MaxFacilityLevel = 5

// FacilityDef describes one campus economy building: what it costs, which
// currency pays for it (the crossed economy, 04 §1.1) and its cost/time curves.
type FacilityDef struct {
	Key         string
	Name        string
	Currency    Currency
	BaseCost    float64
	CostGrowth  float64
	BaseMinutes float64
	TimeGrowth  float64
	MaxLevel    int
}

// Facilities are the campus economy buildings managed by campus.upgrade. The
// original seven club facilities (Stands, Stadium Grounds, …) stay on
// facilities.* (internal/facilities); these are the CoC village buildings.
// Costs/times are content (tunable).
var Facilities = map[string]FacilityDef{
	"turnstiles": {"turnstiles", "Turnstiles", Fans, 40000, 2.4, 20, 2.2, MaxFacilityLevel},
	"club_shop":  {"club_shop", "Club Shop", Cash, 40000, 2.4, 20, 2.2, MaxFacilityLevel},
	"cash_vault": {"cash_vault", "Cash Vault", Fans, 30000, 2.5, 25, 2.3, MaxFacilityLevel},
	"fan_vault":  {"fan_vault", "Fan Vault", Cash, 30000, 2.5, 25, 2.3, MaxFacilityLevel},
	"clubhouse":  {"clubhouse", "Clubhouse", Cash, 500000, 2.6, 60, 2.4, MaxFacilityLevel},
}

// FacilityDefFor returns the definition for a facility key.
func FacilityDefFor(key string) (FacilityDef, bool) {
	def, ok := Facilities[key]
	return def, ok
}

// UpgradeCostFor is the cost for a facility's target level.
func UpgradeCostFor(def FacilityDef, targetLevel int) float64 {
	return math.Round(UpgradeCost(def.BaseCost, def.CostGrowth, targetLevel))
}

// UpgradeMinutesFor is the GAME_TIME_SCALE-aware real-clock build time (minutes)
// for a facility's target level.
func UpgradeMinutesFor(def FacilityDef, targetLevel int, scale float64) float64 {
	return UpgradeMinutesScaled(def.BaseMinutes, def.TimeGrowth, targetLevel, scale)
}

// ---------------------------------------------------------------------------
// Collectors (Turnstiles -> Cash, Club Shop -> Fans) and their vaults.
// ---------------------------------------------------------------------------

// CollectorDef is a passive producer and the vault that caps it.
type CollectorDef struct {
	Key      string
	Name     string
	Currency Currency
	VaultKey string
	BaseRate float64 // per hour at level 1
}

// Collectors are the two campus producers, in canonical order.
var Collectors = []CollectorDef{
	{Key: "turnstiles", Name: "Turnstiles", Currency: Cash, VaultKey: "cash_vault", BaseRate: 600},
	{Key: "club_shop", Name: "Club Shop", Currency: Fans, VaultKey: "fan_vault", BaseRate: 600},
}

// CollectorStorageHours is how many hours of production a vault holds before the
// collector caps (04 §3.1 "BASE_STORAGE_HOURS").
const CollectorStorageHours = 8.0

// CollectorRate is the facility's production per hour at `level`.
func CollectorRate(def CollectorDef, level int) float64 {
	if level <= 0 {
		return 0
	}
	return def.BaseRate * float64(level)
}

// CollectorCapacity is the collector's cap at its level, vault level and
// Clubhouse tier. A missing vault (level 0) still holds the base hours so a
// fresh producer is not dead on arrival.
func CollectorCapacity(def CollectorDef, level, vaultLevel, clubhouseTier int) float64 {
	if level <= 0 {
		return 0
	}
	if vaultLevel < 1 {
		vaultLevel = 1
	}
	base := CollectorRate(def, level) * CollectorStorageHours
	return VaultCapacityForTier(base, 2, vaultLevel, clubhouseTier)
}

// ---------------------------------------------------------------------------
// Groundskeepers and obstacles.
// ---------------------------------------------------------------------------

// GroundskeeperPrice is the Sponsor Credit price of the next Groundskeeper
// (04 §2): #4 and #5 are bought, #1..#3 are milestones and #6 is the Club
// Legacy chain. ok is false when the index is not purchasable.
func GroundskeeperPrice(n int) (price float64, ok bool) {
	switch n {
	case 4:
		return 500, true
	case 5:
		return 1000, true
	default:
		return 0, false
	}
}

// ObstacleDef is a Derelict Grounds obstacle: clearing it costs Cash and pays a
// small Fan bonus (02 §A).
type ObstacleDef struct {
	Kind      string
	ClearCost float64
	BonusFans float64
}

// ObstacleDefs are the clearable obstacle kinds.
var ObstacleDefs = map[string]ObstacleDef{
	"weeds":  {"weeds", 500, 50},
	"dirt":   {"dirt", 1000, 100},
	"rubble": {"rubble", 2000, 200},
}

// ObstacleDefFor returns the definition for an obstacle kind.
func ObstacleDefFor(kind string) (ObstacleDef, bool) {
	def, ok := ObstacleDefs[kind]
	return def, ok
}
