// Package preseason implements the Pre-Season Tour onboarding rail
// (docs/coc-mapping/02 §J, 04 §8, 06 P9): a fixed ladder of AI clubs with
// escalating difficulty that a new club clears stage by stage for guaranteed,
// ledgered income, plus the scripted first-session checklist.
//
// This file is the pure, table-testable core: the stage ladder, the 3★ clearing
// requirement, the difficulty curve and the onboarding progress evaluator.
// repository.go / handlers.go / router.go wire it to Postgres, the P5 raid path
// and HTTP. It reuses campus.GroundskeepersForTier for the Groundskeeper-#2
// milestone rather than duplicating the milestone pricing.
package preseason

import (
	"fs-pro-server/internal/campus"
)

// StarsRequiredPerStage is the 3★ needed to clear every Pre-Season stage
// (02 §J, 04 §8): the ladder mirrors CoC's single-player campaign's 3★ shapes.
const StarsRequiredPerStage = 3

// DefaultSquadRating is a conservative floor for a freshly founded club's
// default squad. No Pre-Season opponent is rated at or above it, so every stage
// is winnable with the squad a club starts with (the "no dead-ends" exit
// criterion, 06 P9). It is deliberately below the observed ratings of real
// squads (40-70) so the guarantee holds with head-room.
const DefaultSquadRating = 60

// Reward is one stage's guaranteed payout. Cash flows through the Club Budget;
// the rest are the campus currencies (04 §1). Every non-zero field becomes a
// TransferLedger row on claim (04 §10: no currency without a ledger row).
type Reward struct {
	Cash           float64
	Fans           int
	ScoutTokens    int
	SponsorCredits int
}

// Empty reports whether a reward pays nothing (never true for a ladder stage).
func (r Reward) Empty() bool {
	return r.Cash == 0 && r.Fans == 0 && r.ScoutTokens == 0 && r.SponsorCredits == 0
}

// Stage is one rung of the fixed Pre-Season Tour ladder.
type Stage struct {
	// Index is the 1-based position in the ladder.
	Index int
	// Code is the deterministic opponent ClubCode ("PRE-01" ...). It is the
	// server-owned opponent's identity key, so the AI club is created once and
	// reused (05 §6: deterministic, server-owned opponents).
	Code string
	// Name is the fixture title shown to the player.
	Name string
	// Opponent is the AI club's display name.
	Opponent string
	// Rating is the opponent squad rating: the escalating difficulty signal.
	Rating int
	// Reward is the guaranteed income, granted once on claim.
	Reward Reward
}

// RequiredStars is the stars needed to clear the stage (always 3).
func (s Stage) RequiredStars() int { return StarsRequiredPerStage }

// BeatableByDefaultSquad reports whether the stage's opponent is weaker than a
// default squad (the no-dead-end property).
func (s Stage) BeatableByDefaultSquad() bool { return s.Rating < DefaultSquadRating }

// Cleared reports whether a star count clears the stage.
func (s Stage) Cleared(stars int) bool { return stars >= s.RequiredStars() }

// Stages is the fixed ladder. Content - tunable without code changes. Difficulty
// rises monotonically and stays strictly below DefaultSquadRating so a new club
// can always clear it. The top of the ladder is tuned to 36 (not 48): a live
// calibration sweep (default 55-rated squad) clears 3★ up to ~44 and drops to 2★
// at 48, so 36 leaves head-room against seed variance (see real_sim_test.go).
var Stages = []Stage{
	{Index: 1, Code: "PRE-01", Name: "Pre-Season Opener", Opponent: "Rusthall Rovers", Rating: 12,
		Reward: Reward{Cash: 5000, Fans: 50}},
	{Index: 2, Code: "PRE-02", Name: "County Cup Warm-up", Opponent: "Marsh End Athletic", Rating: 15,
		Reward: Reward{Cash: 8000, Fans: 80}},
	{Index: 3, Code: "PRE-03", Name: "Riverside Friendly", Opponent: "Riverside Casuals", Rating: 18,
		Reward: Reward{Cash: 12000, Fans: 120}},
	{Index: 4, Code: "PRE-04", Name: "Hilltown Test", Opponent: "Hilltown Wanderers", Rating: 21,
		Reward: Reward{Cash: 17000, Fans: 170, ScoutTokens: 1}},
	{Index: 5, Code: "PRE-05", Name: "Seaside Tour", Opponent: "Seaside United", Rating: 24,
		Reward: Reward{Cash: 23000, Fans: 230, ScoutTokens: 1}},
	{Index: 6, Code: "PRE-06", Name: "Valley Challenge", Opponent: "Valley Rangers", Rating: 27,
		Reward: Reward{Cash: 30000, Fans: 300, ScoutTokens: 2}},
	{Index: 7, Code: "PRE-07", Name: "Highland Clash", Opponent: "Highland Rovers", Rating: 30,
		Reward: Reward{Cash: 38000, Fans: 380, ScoutTokens: 2, SponsorCredits: 1}},
	{Index: 8, Code: "PRE-08", Name: "City Invitational", Opponent: "City Colts", Rating: 32,
		Reward: Reward{Cash: 47000, Fans: 470, ScoutTokens: 3, SponsorCredits: 1}},
	{Index: 9, Code: "PRE-09", Name: "Coastal Classic", Opponent: "Coastal Wanderers", Rating: 34,
		Reward: Reward{Cash: 57000, Fans: 570, ScoutTokens: 4, SponsorCredits: 2}},
	{Index: 10, Code: "PRE-10", Name: "Tour Finale", Opponent: "Athletic Nomads", Rating: 36,
		Reward: Reward{Cash: 70000, Fans: 700, ScoutTokens: 5, SponsorCredits: 3}},
}

// StageCount is the ladder length.
func StageCount() int { return len(Stages) }

// StageAt resolves a 1-based stage index.
func StageAt(index int) (Stage, bool) {
	if index < 1 || index > len(Stages) {
		return Stage{}, false
	}
	return Stages[index-1], true
}

// MaxOpponentRating is the ladder's hardest opponent rating, used to prove the
// no-dead-end property.
func MaxOpponentRating() int {
	max := 0
	for _, s := range Stages {
		if s.Rating > max {
			max = s.Rating
		}
	}
	return max
}

// MandatoryStars is the stars needed to complete the whole ladder.
func MandatoryStars() int { return len(Stages) * StarsRequiredPerStage }

// Escalating reports whether the ladder's difficulty strictly increases. The
// content guarantees this; the function makes it testable.
func Escalating() bool {
	for i := 1; i < len(Stages); i++ {
		if Stages[i].Rating <= Stages[i-1].Rating {
			return false
		}
	}
	return true
}

// NoDeadEnds reports whether every stage is clearable by a default squad (the
// 06 P9 exit criterion). It is the conjunction of the escalating curve and the
// rating head-room.
func NoDeadEnds() bool {
	if !Escalating() {
		return false
	}
	for _, s := range Stages {
		if !s.BeatableByDefaultSquad() {
			return false
		}
	}
	return true
}

// HighestCleared returns the number of consecutive stages cleared from stage 1
// (i.e. the furthest stage index the club has unlocked past). A map of cleared
// stage indexes drives it, so a gap never leaks progress.
func HighestCleared(cleared map[int]bool) int {
	n := 0
	for i := 1; i <= len(Stages); i++ {
		if !cleared[i] {
			break
		}
		n = i
	}
	return n
}

// UnlockedStage is the highest stage the club may play next: one past its
// consecutive cleared progress (stage 1 is always open). It saturates at the
// ladder length.
func UnlockedStage(cleared map[int]bool) int {
	n := HighestCleared(cleared) + 1
	if n > len(Stages) {
		n = len(Stages)
	}
	return n
}

// ---------------------------------------------------------------------------
// Onboarding rail (the scripted first session, 04 §8, 06 P9)
// ---------------------------------------------------------------------------

// StepKind identifies an onboarding step.
type StepKind string

// The first-session rail: build a collector -> collect -> upgrade -> set a grid
// -> win a first raid -> unlock Groundskeeper #2.
const (
	StepBuildCollector StepKind = "build_collector"
	StepCollect        StepKind = "collect"
	StepUpgrade        StepKind = "upgrade"
	StepSetGrid        StepKind = "set_grid"
	StepWinRaid        StepKind = "win_raid"
	StepGroundskeeper2 StepKind = "groundskeeper_2"
)

// OnboardingStep is one item of the rail.
type OnboardingStep struct {
	ID    StepKind
	Title string
	Hint  string
}

// OnboardingRail is the ordered first-session checklist (04 §8).
var OnboardingRail = []OnboardingStep{
	{ID: StepBuildCollector, Title: "Build your first collector", Hint: "Upgrade the Turnstiles or the Club Shop to level 1."},
	{ID: StepCollect, Title: "Collect your income", Hint: "Tap Collect on the campus to bank a collector's takings."},
	{ID: StepUpgrade, Title: "Start an upgrade", Hint: "Queue any campus upgrade; a Groundskeeper will build it."},
	{ID: StepSetGrid, Title: "Set your grid", Hint: "Save a Home layout on the pitch grid so you can defend."},
	{ID: StepWinRaid, Title: "Win your first match", Hint: "Clear a Pre-Season stage (or win a raid) to bank the win."},
	{ID: StepGroundskeeper2, Title: "Unlock Groundskeeper #2", Hint: "Reach Clubhouse tier 2 for your second builder."},
}

// Facts is the world state the evaluator reads. It is computed once from the
// database so the rail is a pure function of a snapshot and is unit-testable.
type Facts struct {
	// TurnstilesLevel / ClubShopLevel are the two soft-currency collectors.
	TurnstilesLevel int
	ClubShopLevel   int
	// Collected is true once any collector income has been banked.
	Collected bool
	// Upgraded is true once any facility upgrade has started or completed.
	Upgraded bool
	// HasGrid is true once any pitch-grid layout is stored (Home/Match/Derby).
	HasGrid bool
	// WonRaid is true once the club has won any raid or Pre-Season stage.
	WonRaid bool
	// Groundskeepers is the club's effective Groundskeeper count.
	Groundskeepers int
}

// Met reports whether a step is complete for the given snapshot. The milestone
// step derives from campus.GroundskeepersForTier (the shared pricing source of
// truth) rather than a duplicated constant.
func Met(step OnboardingStep, f Facts) bool {
	switch step.ID {
	case StepBuildCollector:
		return f.TurnstilesLevel >= 1 || f.ClubShopLevel >= 1
	case StepCollect:
		return f.Collected
	case StepUpgrade:
		return f.Upgraded
	case StepSetGrid:
		return f.HasGrid
	case StepWinRaid:
		return f.WonRaid
	case StepGroundskeeper2:
		// Groundskeeper #2 is the tier-2 milestone (04 §2); reuse the campus
		// milestone function so the target can never drift from the economy.
		return f.Groundskeepers >= campus.GroundskeepersForTier(2)
	default:
		return false
	}
}

// StepState is a step plus its completion for a snapshot.
type StepState struct {
	ID    StepKind
	Title string
	Hint  string
	Done  bool
}

// Evaluate returns the rail's per-step state for a snapshot, in order.
func Evaluate(f Facts) []StepState {
	out := make([]StepState, 0, len(OnboardingRail))
	for _, s := range OnboardingRail {
		out = append(out, StepState{ID: s.ID, Title: s.Title, Hint: s.Hint, Done: Met(s, f)})
	}
	return out
}

// Completed counts the completed steps.
func Completed(f Facts) int {
	n := 0
	for _, s := range OnboardingRail {
		if Met(s, f) {
			n++
		}
	}
	return n
}

// NextStep returns the first incomplete step, if any.
func NextStep(f Facts) (OnboardingStep, bool) {
	for _, s := range OnboardingRail {
		if !Met(s, f) {
			return s, true
		}
	}
	return OnboardingStep{}, false
}

// OnboardingComplete reports whether the whole rail is done.
func OnboardingComplete(f Facts) bool { return Completed(f) == len(OnboardingRail) }
