// Package loot is the raid/collector economy core (docs/coc-mapping/04 §3, §5):
// collector rates, the protected Board Vault, raid loot and league bonuses. Pure
// so the numbers are table-testable.
package loot

// Rate is a collector's income per hour: base + perUnit * units (units = seats,
// fans, etc.).
func Rate(base, perUnit float64, units int) float64 {
	return base + perUnit*float64(units)
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
