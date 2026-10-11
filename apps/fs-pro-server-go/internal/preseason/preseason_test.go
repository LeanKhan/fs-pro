package preseason

import (
	"testing"

	"fs-pro-server/internal/campus"
)

// TestLadderEscalatesAndHasNoDeadEnds proves the ladder's core design
// guarantees (06 P9): difficulty strictly increases, every stage needs 3★, and
// the hardest opponent is still weaker than a default squad so a new club can
// clear the whole thing.
func TestLadderEscalatesAndHasNoDeadEnds(t *testing.T) {
	if StageCount() < 5 {
		t.Fatalf("ladder is too short: %d stages", StageCount())
	}
	if !Escalating() {
		t.Error("ladder difficulty does not strictly increase")
	}
	if !NoDeadEnds() {
		t.Error("ladder has a dead-end: an opponent is not beatable by a default squad")
	}
	if MaxOpponentRating() >= DefaultSquadRating {
		t.Errorf("max opponent rating %d >= default squad rating %d", MaxOpponentRating(), DefaultSquadRating)
	}
	for _, s := range Stages {
		if s.RequiredStars() != 3 {
			t.Errorf("stage %d requires %d★, want 3", s.Index, s.RequiredStars())
		}
		if s.Code == "" || s.Name == "" || s.Opponent == "" {
			t.Errorf("stage %d has empty content: %#v", s.Index, s)
		}
		if s.Reward.Empty() {
			t.Errorf("stage %d grants nothing (guaranteed rewards violated)", s.Index)
		}
	}
	if MandatoryStars() != StageCount()*3 {
		t.Errorf("MandatoryStars = %d, want %d", MandatoryStars(), StageCount()*3)
	}
}

// TestStageRewardsEscalate proves the guaranteed income never falls as
// difficulty rises (a new club always progresses).
func TestStageRewardsEscalate(t *testing.T) {
	for i := 1; i < len(Stages); i++ {
		prev, cur := Stages[i-1].Reward, Stages[i].Reward
		if cur.Cash < prev.Cash || cur.Fans < prev.Fans || cur.ScoutTokens < prev.ScoutTokens {
			t.Errorf("stage %d reward regresses: %+v -> %+v", Stages[i].Index, prev, cur)
		}
	}
}

// TestStageIndexesAreContiguous proves StageAt is 1-based contiguous and out of
// range is refused.
func TestStageIndexesAreContiguous(t *testing.T) {
	for i := 1; i <= StageCount(); i++ {
		s, ok := StageAt(i)
		if !ok || s.Index != i {
			t.Fatalf("StageAt(%d) = %#v, ok=%v", i, s, ok)
		}
		if s.Code == "" {
			t.Fatalf("stage %d has no code", i)
		}
	}
	for _, bad := range []int{0, -1, StageCount() + 1} {
		if _, ok := StageAt(bad); ok {
			t.Errorf("StageAt(%d) unexpectedly resolved", bad)
		}
	}
}

// TestClearingNeedsThreeStars proves only a 3★ result clears a stage and that a
// stage unlocked is exactly one past consecutive progress.
func TestClearingNeedsThreeStars(t *testing.T) {
	stage, _ := StageAt(1)
	for stars, want := range map[int]bool{0: false, 1: false, 2: false, 3: true} {
		if got := stage.Cleared(stars); got != want {
			t.Errorf("Cleared(%d) = %v, want %v", stars, got, want)
		}
	}

	// A gap must not leak progress: clearing 1 and 3 but not 2 leaves you on 2.
	cleared := map[int]bool{1: true, 3: true}
	if got := HighestCleared(cleared); got != 1 {
		t.Errorf("HighestCleared(gap) = %d, want 1", got)
	}
	if got := UnlockedStage(cleared); got != 2 {
		t.Errorf("UnlockedStage(gap) = %d, want 2", got)
	}
	// Full clear saturates at the ladder length.
	full := map[int]bool{}
	for i := 1; i <= StageCount(); i++ {
		full[i] = true
	}
	if got := UnlockedStage(full); got != StageCount() {
		t.Errorf("UnlockedStage(full) = %d, want %d", got, StageCount())
	}
}

// TestOnboardingRailOrderAndMilestone proves the rail runs in the documented
// order and that Groundskeeper #2 is exactly campus.GroundskeepersForTier(2).
func TestOnboardingRailOrderAndMilestone(t *testing.T) {
	wantOrder := []StepKind{
		StepBuildCollector, StepCollect, StepUpgrade, StepSetGrid, StepWinRaid, StepGroundskeeper2,
	}
	if len(OnboardingRail) != len(wantOrder) {
		t.Fatalf("rail has %d steps, want %d", len(OnboardingRail), len(wantOrder))
	}
	for i, id := range wantOrder {
		if OnboardingRail[i].ID != id {
			t.Errorf("rail[%d] = %s, want %s", i, OnboardingRail[i].ID, id)
		}
	}

	milestone := campus.GroundskeepersForTier(2)
	if milestone < 2 {
		t.Fatalf("campus milestone for tier 2 = %d, want >= 2", milestone)
	}
	// One Groundskeeper short of the milestone: not done.
	if Met(OnboardingStep{ID: StepGroundskeeper2}, Facts{Groundskeepers: milestone - 1}) {
		t.Error("Groundskeeper step done below the campus milestone")
	}
	if !Met(OnboardingStep{ID: StepGroundskeeper2}, Facts{Groundskeepers: milestone}) {
		t.Error("Groundskeeper step not done at the campus milestone")
	}
}

// TestOnboardingEvaluatorProgression walks the rail from empty to complete.
func TestOnboardingEvaluatorProgression(t *testing.T) {
	empty := Evaluate(Facts{})
	if len(empty) != len(OnboardingRail) {
		t.Fatalf("Evaluate returned %d steps, want %d", len(empty), len(OnboardingRail))
	}
	for _, s := range empty {
		if s.Done {
			t.Errorf("step %s done on an empty snapshot", s.ID)
		}
	}
	if Completed(Facts{}) != 0 || OnboardingComplete(Facts{}) {
		t.Error("empty snapshot should be 0 completed")
	}
	if first, ok := NextStep(Facts{}); !ok || first.ID != StepBuildCollector {
		t.Errorf("NextStep(empty) = %v, want build_collector", first.ID)
	}

	// The mid-rail snapshot: collector built, income banked, upgrade queued.
	mid := Facts{TurnstilesLevel: 1, Collected: true, Upgraded: true}
	if got := Completed(mid); got != 3 {
		t.Errorf("mid snapshot completed = %d, want 3", got)
	}
	if next, ok := NextStep(mid); !ok || next.ID != StepSetGrid {
		t.Errorf("NextStep(mid) = %v, want set_grid", next.ID)
	}

	full := Facts{
		TurnstilesLevel: 1, Collected: true, Upgraded: true,
		HasGrid: true, WonRaid: true, Groundskeepers: campus.GroundskeepersForTier(2),
	}
	if !OnboardingComplete(full) {
		t.Error("full snapshot should complete the rail")
	}
	if _, ok := NextStep(full); ok {
		t.Error("NextStep on a complete rail should report none")
	}
}

// TestBuildCollectorEitherCollector proves both soft collectors satisfy the
// first step (a player's choice cannot dead-end them).
func TestBuildCollectorEitherCollector(t *testing.T) {
	step := OnboardingStep{ID: StepBuildCollector}
	if !Met(step, Facts{TurnstilesLevel: 1}) {
		t.Error("Turnstiles level 1 should satisfy build_collector")
	}
	if !Met(step, Facts{ClubShopLevel: 1}) {
		t.Error("Club Shop level 1 should satisfy build_collector")
	}
	if Met(step, Facts{}) {
		t.Error("no collector should not satisfy build_collector")
	}
}
