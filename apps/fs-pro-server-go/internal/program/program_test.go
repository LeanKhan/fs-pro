package program

import "testing"

// The step machine mirrors program-constants.ts.
var (
	activeSteps = []string{"manager", "players", "facilities", "level1"}
	nextStep    = map[string]string{"manager": "players", "players": "facilities", "facilities": "level1", "level1": "done", "done": "done"}
	rewardXP    = map[int]int{1: 3, 2: 9, 3: 18}
)

func activeStepOf(step string) (string, bool) {
	if step == "not_started" {
		return "manager", true
	}
	if step == "done" {
		return "", false
	}
	for _, s := range activeSteps {
		if s == step {
			return s, true
		}
	}
	return "", false
}

func programXpFromStars(stepStars map[string]int, exclude string) int {
	total := 0
	for step, stars := range stepStars {
		if step == exclude {
			continue
		}
		total += rewardXP[stars]
	}
	if total > 54 {
		return 54
	}
	return total
}

func TestActiveStepOf(t *testing.T) {
	if s, ok := activeStepOf("not_started"); !ok || s != "manager" {
		t.Fatalf("not_started = (%q,%v)", s, ok)
	}
	if _, ok := activeStepOf("done"); ok {
		t.Fatal("done must have no active step")
	}
	if s, ok := activeStepOf("facilities"); !ok || s != "facilities" {
		t.Fatalf("facilities = (%q,%v)", s, ok)
	}
}

func TestNextStepChain(t *testing.T) {
	if nextStep["manager"] != "players" || nextStep["level1"] != "done" || nextStep["done"] != "done" {
		t.Fatalf("next-step chain wrong: %v", nextStep)
	}
}

func TestProgramXpFromStars(t *testing.T) {
	if got := programXpFromStars(map[string]int{"manager": 3, "players": 2}, "players"); got != 18 {
		t.Fatalf("xp excluding players = %d, want 18", got)
	}
	// Capped at 54.
	if got := programXpFromStars(map[string]int{"a": 3, "b": 3, "c": 3, "d": 3}, ""); got != 54 {
		t.Fatalf("xp cap = %d, want 54", got)
	}
}

func TestLoanGuardMessages(t *testing.T) {
	if errClubNotFound.Error() != "Club not found" {
		t.Fatalf("club-not-found message = %q", errClubNotFound.Error())
	}
	if loanGross-loanFee != 200000 {
		t.Fatalf("loan net = %d, want 200000", loanGross-loanFee)
	}
}
