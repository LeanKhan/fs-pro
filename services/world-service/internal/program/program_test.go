package program

import (
	"reflect"
	"testing"
)

// facts builds a StepFacts with sensible defaults for table tests.
func facts(step Step) StepFacts {
	return StepFacts{
		Step:            step,
		StartingBalance: 3_000_000,
		Budget:          3_000_000,
	}
}

func intp(v int) *int { return &v }

func eval(t *testing.T, f StepFacts) ProgramEvaluation {
	t.Helper()
	out, err := Evaluate(ProgramEvaluateRequest{Step: f.Step, Facts: f})
	if err != nil {
		t.Fatalf("Evaluate(%s): %v", f.Step, err)
	}
	return out
}

func TestManagerStep(t *testing.T) {
	tests := []struct {
		name      string
		f         StepFacts
		completed bool
		stars     Stars
	}{
		{"no manager", facts(StepManager), false, 0},
		{"manager with no contract", func() StepFacts {
			f := facts(StepManager)
			f.Manager = &ManagerFacts{Overall: 70, ContractYears: 0}
			return f
		}(), false, 0},
		{"cheap weak manager", func() StepFacts {
			f := facts(StepManager)
			f.Manager = &ManagerFacts{Overall: 50, SigningFee: 1_500_000, ContractYears: 3}
			return f
		}(), true, 1},
		{"overall 55 star2", func() StepFacts {
			f := facts(StepManager)
			f.Manager = &ManagerFacts{Overall: 55, SigningFee: 1_500_000, ContractYears: 3}
			return f
		}(), true, 2},
		{"fee cap star2", func() StepFacts {
			f := facts(StepManager)
			f.Manager = &ManagerFacts{Overall: 50, SigningFee: 900_000, ContractYears: 3}
			return f
		}(), true, 2},
		{"star3", func() StepFacts {
			f := facts(StepManager)
			f.Manager = &ManagerFacts{Overall: 62, SigningFee: 360_000, ContractYears: 3}
			return f
		}(), true, 3},
		{"star3 misses cash floor", func() StepFacts {
			f := facts(StepManager)
			f.Manager = &ManagerFacts{Overall: 62, SigningFee: 360_000, ContractYears: 3}
			f.Budget = 399_999
			return f
		}(), true, 2},
		{"star3 misses fee cap", func() StepFacts {
			f := facts(StepManager)
			f.Manager = &ManagerFacts{Overall: 62, SigningFee: 1_300_000, ContractYears: 3}
			return f
		}(), true, 2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out := eval(t, tt.f)
			if out.Completed != tt.completed || out.Stars != tt.stars {
				t.Fatalf("completed=%v stars=%d, want %v %d (reasons %v)", out.Completed, out.Stars, tt.completed, tt.stars, out.Reasons)
			}
		})
	}
}

func TestPlayersStep(t *testing.T) {
	tests := []struct {
		name      string
		squad     SquadFacts
		budget    float64
		completed bool
		stars     Stars
	}{
		{"empty", SquadFacts{}, 3_000_000, false, 0},
		{"ten players", SquadFacts{Total: 10, GK: 1}, 3_000_000, false, 0},
		{"no keeper", SquadFacts{Total: 11, GK: 0}, 3_000_000, false, 0},
		{"legal thin", SquadFacts{Total: 11, GK: 1, Def: 4, Mid: 4, Att: 2}, 3_000_000, true, 1},
		{"balanced", SquadFacts{Total: 13, GK: 2, Def: 4, Mid: 4, Att: 3}, 3_000_000, true, 2},
		{"balanced star3", SquadFacts{Total: 13, GK: 2, Def: 4, Mid: 4, Att: 3, MedianRating: 55}, 3_000_000, true, 3},
		{"balanced low median", SquadFacts{Total: 13, GK: 2, Def: 4, Mid: 4, Att: 3, MedianRating: 54.9}, 3_000_000, true, 2},
		{"balanced low cash", SquadFacts{Total: 13, GK: 2, Def: 4, Mid: 4, Att: 3, MedianRating: 60}, 99_999, true, 2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := facts(StepPlayers)
			f.Squad = tt.squad
			f.Budget = tt.budget
			out := eval(t, f)
			if out.Completed != tt.completed || out.Stars != tt.stars {
				t.Fatalf("completed=%v stars=%d, want %v %d (reasons %v)", out.Completed, out.Stars, tt.completed, tt.stars, out.Reasons)
			}
		})
	}
}

func TestFacilitiesStep(t *testing.T) {
	tests := []struct {
		name      string
		assets    []AssetFacts
		budget    float64
		completed bool
		stars     Stars
	}{
		{"none", nil, 3_000_000, false, 0},
		{"tier0 only", []AssetFacts{{Type: "stands", Tier: 0, HasEffect: true}}, 3_000_000, false, 0},
		{"mid-upgrade tier0", []AssetFacts{{Type: "stands", Tier: 0, UpgradingTo: intp(1)}}, 3_000_000, false, 0},
		{"youth academy", []AssetFacts{{Type: "youth_academy", Tier: 1, HasEffect: true}}, 3_000_000, true, 1},
		{"training ground rich", []AssetFacts{{Type: "training_ground", Tier: 1, HasEffect: true}}, 3_000_000, true, 3},
		{"training ground star3", []AssetFacts{{Type: "training_ground", Tier: 1, HasEffect: true}}, 250_000, true, 3},
		{"star3 low cash", []AssetFacts{{Type: "training_ground", Tier: 1, HasEffect: true}}, 199_999, true, 2},
		{"star3 no effect", []AssetFacts{{Type: "training_ground", Tier: 1, HasEffect: false}}, 3_000_000, true, 2},
		{"completed with an upgrade running", []AssetFacts{
			{Type: "training_ground", Tier: 1, HasEffect: true},
			{Type: "stands", Tier: 0, UpgradingTo: intp(1)},
		}, 300_000, true, 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := facts(StepFacilities)
			f.Assets = tt.assets
			f.Budget = tt.budget
			out := eval(t, f)
			if out.Completed != tt.completed || out.Stars != tt.stars {
				t.Fatalf("completed=%v stars=%d, want %v %d (reasons %v)", out.Completed, out.Stars, tt.completed, tt.stars, out.Reasons)
			}
		})
	}
}

func TestLevel1Step(t *testing.T) {
	tests := []struct {
		name      string
		clubXp    int
		programXp int
		wins      int
		completed bool
		stars     Stars
	}{
		{"not reached", 99, 0, 0, false, 0},
		{"reached 1 star", 100, 0, 0, true, 1},
		{"reached 2 star", 100, 27, 0, true, 2},
		{"reached 3 star needs wins", 100, 54, 1, true, 2},
		{"reached 3 star", 100, 54, 2, true, 3},
		{"over threshold", 130, 54, 2, true, 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := facts(StepLevel1)
			f.ClubXp = tt.clubXp
			f.ProgramXp = tt.programXp
			f.Friendlies.Wins = tt.wins
			out := eval(t, f)
			if out.Completed != tt.completed || out.Stars != tt.stars {
				t.Fatalf("completed=%v stars=%d, want %v %d (reasons %v)", out.Completed, out.Stars, tt.completed, tt.stars, out.Reasons)
			}
		})
	}
}

func TestRewardTable(t *testing.T) {
	want := map[Stars]int{0: 0, 1: 3, 2: 9, 3: 18}
	for s, w := range want {
		if got := RewardXP(s); got != w {
			t.Errorf("RewardXP(%d) = %d, want %d", s, got, w)
		}
	}
	if got := AddProgramXp(50, 18); got != ProgramXpCap {
		t.Errorf("AddProgramXp(50,18) = %d, want cap %d", got, ProgramXpCap)
	}
	if got := AddProgramXp(9, 9); got != 18 {
		t.Errorf("AddProgramXp(9,9) = %d, want 18", got)
	}
	r := Rewards()
	if r["1"] != 3 || r["2"] != 9 || r["3"] != 18 {
		t.Errorf("Rewards() = %v", r)
	}
}

func TestEvaluationXpAggregation(t *testing.T) {
	f := facts(StepManager)
	f.Manager = &ManagerFacts{Overall: 62, SigningFee: 360_000, ContractYears: 3}
	f.ProgramXp = 9
	out := eval(t, f)
	if out.Xp != 18 || out.ProgramXp != 27 {
		t.Fatalf("xp=%d programXp=%d, want 18/27", out.Xp, out.ProgramXp)
	}
	// Level1 pays 0 and keeps the caller's total (capped).
	l := facts(StepLevel1)
	l.ClubXp = 100
	l.ProgramXp = 54
	out = eval(t, l)
	if out.Xp != 0 || out.ProgramXp != 54 {
		t.Fatalf("level1 xp=%d programXp=%d, want 0/54", out.Xp, out.ProgramXp)
	}
}

func TestNextStep(t *testing.T) {
	tests := []struct {
		step      Step
		completed bool
		want      Step
	}{
		{StepManager, false, StepManager},
		{StepManager, true, StepPlayers},
		{StepPlayers, true, StepFacilities},
		{StepFacilities, true, StepLevel1},
		{StepLevel1, true, StepDone},
		{StepLevel1, false, StepLevel1},
	}
	for _, tt := range tests {
		f := facts(tt.step)
		var req ProgramNextRequest
		switch tt.step {
		case StepManager:
			if tt.completed {
				f.Manager = &ManagerFacts{Overall: 62, SigningFee: 100_000, ContractYears: 3}
				f.Budget = 1_000_000
			}
		case StepPlayers:
			f.Squad = SquadFacts{Total: 12, GK: 1, Def: 4, Mid: 4, Att: 3}
		case StepFacilities:
			f.Assets = []AssetFacts{{Type: "training_ground", Tier: 1, HasEffect: true}}
		case StepLevel1:
			if tt.completed {
				f.ClubXp = 100
			}
		}
		req = ProgramNextRequest{Step: tt.step, Facts: f}
		out, err := Next(req)
		if err != nil {
			t.Fatal(err)
		}
		if out.NextStep != tt.want || out.Completed != tt.completed {
			t.Errorf("Next(%s completed=%v) = %s/%v, want %s/%v", tt.step, tt.completed, out.NextStep, out.Completed, tt.want, tt.completed)
		}
	}
	done, err := Next(ProgramNextRequest{Step: StepDone, Facts: StepFacts{Step: StepDone}})
	if err != nil {
		t.Fatal(err)
	}
	if done.NextStep != StepDone || !done.Completed {
		t.Fatalf("Next(done) = %+v", done)
	}
}

func TestStepsConfig(t *testing.T) {
	cfg := Steps()
	if len(cfg.Steps) != 4 {
		t.Fatalf("len(steps) = %d, want 4", len(cfg.Steps))
	}
	if cfg.ProgramXpCap != 54 || cfg.Level1Xp != 100 {
		t.Fatalf("caps: %+v", cfg)
	}
	if cfg.MatchXp != (MatchXpConfig{Win: 30, Draw: 10, Loss: 5}) {
		t.Fatalf("matchXp: %+v", cfg.MatchXp)
	}
	if cfg.Fees != (FeeConfig{Interview: 25000, Scout: 15000}) {
		t.Fatalf("fees: %+v", cfg.Fees)
	}
	for _, s := range cfg.Steps {
		if s.ID == StepLevel1 {
			if s.Rewards["1"] != 0 || s.Rewards["3"] != 0 {
				t.Fatalf("level1 rewards must be zero: %v", s.Rewards)
			}
		} else if s.Rewards["1"] != 3 || s.Rewards["2"] != 9 || s.Rewards["3"] != 18 {
			t.Fatalf("%s rewards: %v", s.ID, s.Rewards)
		}
		if len(s.AdvisorRules) != 6 {
			t.Fatalf("%s advisorRules: %v", s.ID, s.AdvisorRules)
		}
	}
}

func TestValidation(t *testing.T) {
	tests := []struct {
		name string
		req  any
		err  bool
	}{
		{"manager ok", ProgramEvaluateRequest{Step: StepManager, Facts: facts(StepManager)}, false},
		{"step mismatch", ProgramEvaluateRequest{Step: StepManager, Facts: facts(StepPlayers)}, true},
		{"bad step", ProgramEvaluateRequest{Step: "nope", Facts: StepFacts{Step: "nope"}}, true},
		{"negative squad", ProgramEvaluateRequest{Step: StepPlayers, Facts: func() StepFacts { f := facts(StepPlayers); f.Squad.Total = -1; return f }()}, true},
		{"zero now tip", ProgramTipRequest{Facts: facts(StepManager), Now: 0}, true},
		{"positive now tip", ProgramTipRequest{Facts: facts(StepManager), Now: 1}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var err error
			switch r := tt.req.(type) {
			case ProgramEvaluateRequest:
				err = r.Validate()
			case ProgramTipRequest:
				err = r.Validate()
			}
			if (err != nil) != tt.err {
				t.Fatalf("err = %v, want error %v", err, tt.err)
			}
		})
	}
}

func TestVilla(t *testing.T) {
	tests := map[float64]string{
		1_000_000: "V1.0M",
		3_200_000: "V3.2M",
		150_000:   "V150,000",
		1_500:     "V1,500",
		0:         "V0",
	}
	for v, want := range tests {
		if got := Villa(v); got != want {
			t.Errorf("Villa(%.0f) = %q, want %q", v, got, want)
		}
	}
}

func TestAdvisorLineShape(t *testing.T) {
	// The balance reveal is the first line and reflects the draw.
	f := facts(StepManager)
	f.StartingBalance = 1_000_000
	req := ProgramTipRequest{Facts: f, Now: 1_000_000}
	out, err := Tip(req)
	if err != nil {
		t.Fatal(err)
	}
	if out.Tip == nil || out.Tip.ID != "balance.reveal" {
		t.Fatalf("first tip = %+v, want balance.reveal", out.Tip)
	}
	if out.Tip.Expr != ExprWorried {
		t.Errorf("V1M reveal expr = %s, want worried", out.Tip.Expr)
	}
	if out.Tip.Text == "" || out.Tip.Speaker != "vintra" {
		t.Errorf("reveal line incomplete: %+v", out.Tip)
	}
	f.StartingBalance = 5_000_000
	out, _ = Tip(ProgramTipRequest{Facts: f, Now: 1_000_000})
	if out.Tip.Expr != ExprExcited {
		t.Errorf("V5M reveal expr = %s, want excited", out.Tip.Expr)
	}
}

func TestTipSelectionPriorityAndCooldown(t *testing.T) {
	// At a very low budget the recovery line (priority 96) beats the step
	// blocked line (priority 92).
	f := facts(StepManager)
	f.Budget = 10_000 // below cheapest manager
	out, err := Tip(ProgramTipRequest{Facts: f, Now: 1_000_000})
	if err != nil {
		t.Fatal(err)
	}
	if out.Tip == nil || out.Tip.ID != "tip.recovery.board" {
		t.Fatalf("tip = %+v, want tip.recovery.board", out.Tip)
	}

	// Dismissing the recovery line falls through to the step blocked line.
	out, _ = Tip(ProgramTipRequest{Facts: f, Now: 1_000_000, Advisor: AdvisorState{Dismissed: []string{"tip.recovery.board"}}})
	if out.Tip == nil || out.Tip.ID != "step.manager.blocked" {
		t.Fatalf("tip after dismiss = %+v, want step.manager.blocked", out.Tip)
	}

	// With both blocked lines dismissed, the balance reveal (85) shows.
	out, _ = Tip(ProgramTipRequest{Facts: f, Now: 1_000_000, Advisor: AdvisorState{
		Dismissed: []string{"tip.recovery.board", "step.manager.blocked"},
	}})
	if out.Tip == nil || out.Tip.ID != "balance.reveal" {
		t.Fatalf("tip after dismissing blocked = %+v, want balance.reveal", out.Tip)
	}

	// Once the reveal has shown, the arrival line (80) takes over.
	dismissed := []string{"tip.recovery.board", "step.manager.blocked"}
	out, _ = Tip(ProgramTipRequest{Facts: f, Now: 1_000_000, Advisor: AdvisorState{
		Dismissed: dismissed,
		Shows:     map[string]int{"balance.reveal": 1},
	}})
	if out.Tip == nil || out.Tip.ID != "step.manager.arrive" {
		t.Fatalf("tip after reveal = %+v, want step.manager.arrive", out.Tip)
	}

	// maxShows caps the arrival line; the nudge (72) takes over.
	out, _ = Tip(ProgramTipRequest{Facts: f, Now: 1_000_000, Advisor: AdvisorState{
		Dismissed: dismissed,
		Shows:     map[string]int{"balance.reveal": 1, "step.manager.arrive": 1},
	}})
	if out.Tip == nil || out.Tip.ID != "step.manager.nudge" {
		t.Fatalf("tip after arrive maxed = %+v, want step.manager.nudge", out.Tip)
	}
}

func TestTipQuietSuppressesLowPriority(t *testing.T) {
	f := facts(StepManager)
	// manager != null gives tip.milestone.manager (priority 45 < 70).
	f.Manager = &ManagerFacts{Overall: 60, SigningFee: 100_000, ContractYears: 3}
	out, _ := Tip(ProgramTipRequest{Facts: f, Now: 1_000_000, Advisor: AdvisorState{Quiet: true}})
	if out.Tip != nil && out.Tip.Priority < QuietPriorityFloor {
		t.Fatalf("quiet mode showed low-priority tip %+v", out.Tip)
	}
}

func TestEvaluateAdvisorLine(t *testing.T) {
	f := facts(StepManager)
	f.Manager = &ManagerFacts{Overall: 62, SigningFee: 360_000, ContractYears: 3}
	out := eval(t, f)
	if len(out.Advisor) != 1 {
		t.Fatalf("advisor lines = %d, want 1", len(out.Advisor))
	}
	if out.Advisor[0].ID != "step.manager.done.3" {
		t.Fatalf("advisor = %+v, want step.manager.done.3", out.Advisor[0])
	}
	// No manager -> arrival line.
	out = eval(t, facts(StepManager))
	if len(out.Advisor) != 1 || out.Advisor[0].ID != "balance.reveal" {
		// balance.reveal is not step-prefixed, so the step arrival wins here.
		if len(out.Advisor) != 1 || out.Advisor[0].ID != "step.manager.arrive" {
			t.Fatalf("advisor = %+v, want step.manager.arrive", out.Advisor)
		}
	}
}

func TestReasonsArePopulated(t *testing.T) {
	out := eval(t, facts(StepPlayers))
	if len(out.Reasons) == 0 {
		t.Fatal("expected reasons")
	}
	if out.Reasons[0] == "" {
		t.Fatal("empty reason")
	}
}

func TestEvaluationIsDeterministic(t *testing.T) {
	f := facts(StepPlayers)
	f.Squad = SquadFacts{Total: 13, GK: 2, Def: 4, Mid: 4, Att: 3, MedianRating: 56}
	f.Budget = 500_000
	a := eval(t, f)
	b := eval(t, f)
	if !reflect.DeepEqual(a, b) {
		t.Fatalf("nondeterministic evaluation:\n%+v\n%+v", a, b)
	}
}
