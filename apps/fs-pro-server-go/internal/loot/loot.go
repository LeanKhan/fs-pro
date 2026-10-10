// Package loot is the raid/collector economy core (docs/coc-mapping/04 §3, §5):
// collector rates, the protected Board Vault, raid loot and league bonuses. Pure
// so the numbers are table-testable.
package loot

// Rate is a collector's income per hour: base + perUnit * units (units = seats,
// fans, etc.).
func Rate(base, perUnit float64, units int) float64 {
	return base + perUnit*float64(units)
}

// Collector tier multipliers (04 §3.1). The Cash collector (Turnstiles) scales
// with the Clubhouse tier and the Fan collector (Club Shop) with its own shop
// level:
//
//	Cash/hr multiplier = 1 + clubhouse_tier*0.05
//	Fan/hr  multiplier = 1 + shop_level*0.08
//
// They live in the pure economy core so a collector caller can wrap its Rate:
// RateTiered(base, perUnit, units, CashRateMultiplier(tier)). Rate's signature
// is unchanged; a caller that has no tier context keeps using the bare Rate.
const (
	// ClubhouseTierRateBonusPct is the per-Clubhouse-tier Cash bonus (04 §3.1).
	ClubhouseTierRateBonusPct = 0.05
	// ShopLevelRateBonusPct is the per-Club-Shop-level Fan bonus (04 §3.1).
	ShopLevelRateBonusPct = 0.08
)

// TierMultiplier is 1 + level*pctPerLevel, the per-level collector bonus factor
// (04 §3.1). A negative level is treated as 0, so a fresh producer earns the
// bare base rate.
func TierMultiplier(level int, pctPerLevel float64) float64 {
	if level < 0 {
		level = 0
	}
	return 1 + float64(level)*pctPerLevel
}

// CashRateMultiplier is the Clubhouse-tier factor on the Cash collector (04
// §3.1): 1 + clubhouseTier*0.05.
func CashRateMultiplier(clubhouseTier int) float64 {
	return TierMultiplier(clubhouseTier, ClubhouseTierRateBonusPct)
}

// FanRateMultiplier is the Club-Shop-level factor on the Fan collector (04
// §3.1): 1 + shopLevel*0.08.
func FanRateMultiplier(shopLevel int) float64 {
	return TierMultiplier(shopLevel, ShopLevelRateBonusPct)
}

// RateTiered is Rate scaled by a collector tier multiplier (04 §3.1):
// (base + perUnit*units) · multiplier. A non-positive multiplier is treated as
// 1, so an unknown tier can never zero a collector's income. It is the additive
// extension point that keeps Rate's signature intact (OW-P12).
func RateTiered(base, perUnit float64, units int, multiplier float64) float64 {
	if multiplier <= 0 {
		multiplier = 1
	}
	return Rate(base, perUnit, units) * multiplier
}

// VaultProtectedPct is the share of Board Vault loot that cannot be stolen; only
// the remainder is exposed (04 §5.2).
const VaultProtectedPct = 97

// VaultStealable is the stealable slice of a Board Vault balance.
func VaultStealable(vault int) int {
	if vault <= 0 {
		return 0
	}
	return vault * (100 - VaultProtectedPct) / 100
}

// RaidLoot is the loot taken from a defender's unspent holdings: a share in basis
// points, capped. Unspent holdings are the anti-hoarding pressure (04 §5.1).
func RaidLoot(unspent int, shareBp int, cap int) int {
	if unspent <= 0 || shareBp <= 0 {
		return 0
	}
	v := unspent * shareBp / 10000
	if cap > 0 && v > cap {
		return cap
	}
	return v
}

// LeagueBonus scales a base bonus by a league multiplier expressed x100
// (e.g. multiplierX100 = 210 → x2.10).
func LeagueBonus(base int, multiplierX100 int) int {
	if base <= 0 || multiplierX100 <= 0 {
		return 0
	}
	return base * multiplierX100 / 100
}

// starShareBp is the share of a defender's unspent holdings a raid steals at
// each star rating, in basis points (04 §5.1: loot scales with the rating).
// Index 0..3 = stars; a 0★ raid takes nothing.
var starShareBp = [4]int{0, 2000, 3500, 5000}

// StarShareBp returns the steal share (basis points) for a star rating,
// clamped to 0..3. It is the star-rating input the original RaidLoot lacked
// (Batch-0 finding, Wave-2/P5).
func StarShareBp(stars int) int {
	if stars < 0 {
		stars = 0
	}
	if stars > 3 {
		stars = 3
	}
	return starShareBp[stars]
}

// bonusBase is the system-paid Star Bonus (Cash) before the league multiplier,
// by star rating. The star rating also determines the *system-paid* portion of
// a raid payout, distinct from loot stolen from the defender (04 §5.1).
var bonusBase = [4]int{0, 4000, 9000, 15000}

// StarBonus is the system-paid bonus for a star rating, scaled by the league
// multiplier (x100). It is paid by the system into the attacker's Board Vault,
// never stolen from the defender.
func StarBonus(stars int, multiplierX100 int) int {
	if stars < 0 {
		stars = 0
	}
	if stars > 3 {
		stars = 3
	}
	if multiplierX100 <= 0 {
		return 0
	}
	return bonusBase[stars] * multiplierX100 / 100
}

// RaidLootForStars is the loot stolen from a defender's unspent holdings for a
// star rating and league multiplier: share(stars) · unspent · multiplier,
// capped. It is RaidLoot with the star-rating input wired in (04 §5.1).
func RaidLootForStars(unspent, stars, multiplierX100, cap int) int {
	if unspent <= 0 || multiplierX100 <= 0 {
		return 0
	}
	v := unspent * StarShareBp(stars) / 10000
	v = v * multiplierX100 / 100
	if cap > 0 && v > cap {
		return cap
	}
	return v
}

// RaidSplit returns the two halves of a raid payout: the loot stolen from the
// defender's unspent holdings (capped) and the bonus paid by the system. The
// attacker receives both; only `stolen` is debited from the defender (04 §5.1).
func RaidSplit(unspent, stars, multiplierX100, cap int) (stolen, systemPaid int) {
	return RaidLootForStars(unspent, stars, multiplierX100, cap), StarBonus(stars, multiplierX100)
}

// boardVaultBase/boardVaultPerTier give the Board Vault capacity for a
// Clubhouse tier (04 §5.2, §3.3): the protected buffer grows with the campus.
const (
	boardVaultBase    = 100_000
	boardVaultPerTier = 50_000
)

// BoardVaultCapacity is the protected bonus-loot capacity for a Clubhouse tier.
// It is the buffer the system-paid Star Bonus accrues into; only
// VaultStealable of it is exposed to raiders. tier < 1 is treated as tier 1.
func BoardVaultCapacity(tier int) int {
	if tier < 1 {
		tier = 1
	}
	return boardVaultBase + boardVaultPerTier*(tier-1)
}
