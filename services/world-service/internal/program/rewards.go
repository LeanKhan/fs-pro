package program

// Reward and economy constants (OWNER-PROGRAM-SPEC.md §3.2, §5, §6). These are
// the frozen knobs 4A tunes; the Go code and the contract must agree.
const (
	// ProgramXpCap caps the sum of per-step star rewards (spec §3.2).
	ProgramXpCap = 54
	// Level1Xp is the XP a club needs to reach Level 1 (level.ts:10).
	Level1Xp = 100

	// MatchXpWin/Draw/Loss are REWARD_XP in play.service.ts:49.
	MatchXpWin  = 30
	MatchXpDraw = 10
	MatchXpLoss = 5

	// InterviewFee and ScoutFee are the hidden-info costs (spec §4, §5.3).
	InterviewFee = 25_000
	ScoutFee     = 15_000

	// NegotiationBonus is the interview discount on a manager's signing fee.
	NegotiationBonus = 0.10

	// Cheapest manager fee and cheapest legal XI (spec §4 steps 1–2).
	CheapestManagerFee  = 40_000
	CheapestPlayerPrice = 20_000
	LegalXiCost         = 11 * CheapestPlayerPrice

	// Star-3 cash floors from the step table (spec §3.2).
	ManagerCashFloor    = 400_000
	PlayersCashFloor    = 100_000
	FacilitiesCashFloor = 200_000

	// ManagerStepFeeRatio is the 40% fee-to-starting-balance test.
	ManagerStepFeeRatio = 0.40
)

// rewardXp is the per-star program reward: {1:3, 2:9, 3:18}.
var rewardXp = [4]int{0, 3, 9, 18}

// RewardXP returns the program XP for a star rating (0 for not completed).
func RewardXP(s Stars) int {
	if s < 1 || s > 3 {
		return 0
	}
	return rewardXp[s]
}

// StepRewards is the JSON "rewards" object of a step: {"1":3,"2":9,"3":18}.
type StepRewards map[string]int

// Rewards returns the canonical per-step reward table.
func Rewards() StepRewards {
	return StepRewards{"1": rewardXp[1], "2": rewardXp[2], "3": rewardXp[3]}
}

// AddProgramXp adds a step's reward to the running total, capped at 54.
func AddProgramXp(current, xp int) int {
	total := current + xp
	if total > ProgramXpCap {
		return ProgramXpCap
	}
	if total < 0 {
		return 0
	}
	return total
}
