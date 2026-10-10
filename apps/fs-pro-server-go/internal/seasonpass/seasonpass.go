// Package seasonpass is the monthly Season core (docs/coc-mapping/04 §6):
// objective points -> tier, the free/pass track gate, and the Season Bank that
// accrues loot during the month. Pure so the rules are table-testable.
package seasonpass

// TierThresholds[i] is the objective points needed for tier i+1. Content - tunable.
var TierThresholds = []int{
	0, 250, 500, 800, 1200, 1700, 2300, 3000, 3800, 4700,
	5700, 6800, 8000, 9400, 11000, 12800, 14800, 17000, 19500, 22500,
}

// MaxTier is the number of reward tiers.
func MaxTier() int { return len(TierThresholds) }

// TierForPoints is the highest reward tier reached for an objective-point total.
func TierForPoints(points int) int {
	tier := 0
	for i, need := range TierThresholds {
		if points >= need {
			tier = i + 1
		}
	}
	return tier
}

// NextThreshold is the points needed for the tier after `points` (0 when maxed).
func NextThreshold(points int) int {
	tier := TierForPoints(points)
	if tier >= MaxTier() {
		return 0
	}
	return TierThresholds[tier]
}

// TrackReward gated by the paid Season Pass: the Gold track is pass-only.
type Track string

// The two reward tracks.
const (
	Silver Track = "silver"
	Gold   Track = "gold"
)

// CanClaim reports whether a track's tier reward may be claimed. Only the two
// declared tracks are claimable: Silver is free for all, Gold requires the paid
// Season Pass. An unknown track is never claimable (server-side gate).
func CanClaim(track Track, hasPass bool, tier, claimedTier int) bool {
	if tier <= claimedTier {
		return false
	}
	switch track {
	case Silver:
		return true
	case Gold:
		return hasPass
	default:
		return false
	}
}

// BankAccrual is the Season Bank slice of an income amount, in basis points
// (e.g. shareBp = 2000 → 20%).
func BankAccrual(income int, shareBp int) int {
	if income <= 0 || shareBp <= 0 {
		return 0
	}
	return income * shareBp / 10000
}

// BankClaimable is the unclaimed Season Bank balance at season end.
func BankClaimable(accrued, claimed int) int {
	if accrued <= claimed {
		return 0
	}
	return accrued - claimed
}
