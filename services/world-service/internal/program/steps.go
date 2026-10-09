package program

// This file holds the step table plus the top-level pure entry points that the
// HTTP layer wraps. Everything here is deterministic and DB-free.

// StepInfo is one row of the step table returned by GET /program/steps.
type StepInfo struct {
	ID           Step              `json:"id"`
	Order        int               `json:"order"`
	Rewards      StepRewards       `json:"rewards"`
	StarLabels   map[string]string `json:"starLabels"`
	AdvisorRules []string          `json:"advisorRules"`
}

// MatchXpConfig mirrors REWARD_XP.
type MatchXpConfig struct {
	Win  int `json:"win"`
	Draw int `json:"draw"`
	Loss int `json:"loss"`
}

// FeeConfig mirrors the hidden-info costs.
type FeeConfig struct {
	Interview int `json:"interview"`
	Scout     int `json:"scout"`
}

// StepsConfig is the GET /program/steps response.
type StepsConfig struct {
	Steps        []StepInfo    `json:"steps"`
	ProgramXpCap int           `json:"programXpCap"`
	Level1Xp     int           `json:"level1Xp"`
	MatchXp      MatchXpConfig `json:"matchXp"`
	Fees         FeeConfig     `json:"fees"`
}

// Steps returns the frozen step table.
func Steps() StepsConfig {
	stepLabels := func(one, two, three string) map[string]string {
		return map[string]string{"1": one, "2": two, "3": three}
	}
	return StepsConfig{
		Steps: []StepInfo{
			{
				ID:      StepManager,
				Order:   1,
				Rewards: Rewards(),
				StarLabels: stepLabels(
					"Any hire with a live contract.",
					"Overall ≥ 55 or fee ≤ 40% of the starting balance.",
					"Overall ≥ 60, fee ≤ 40%, and at least V400k cash left.",
				),
				AdvisorRules: stepRuleIDs(StepManager),
			},
			{
				ID:      StepPlayers,
				Order:   2,
				Rewards: Rewards(),
				StarLabels: stepLabels(
					"A legal XI: 11+ signed players and at least one keeper.",
					"Legal and shape-balanced (≥2 GK, ≥4 DEF, ≥4 MID, ≥3 ATT).",
					"Balanced, median XI rating ≥ 55, and ≥ V100k cash left.",
				),
				AdvisorRules: stepRuleIDs(StepPlayers),
			},
			{
				ID:      StepFacilities,
				Order:   3,
				Rewards: Rewards(),
				StarLabels: stepLabels(
					"Any completed Tier-1 facility.",
					"A Tier-1 from {training ground, stands, medical centre}.",
					"That choice, ≥ V200k cash left, and a non-zero effect.",
				),
				AdvisorRules: stepRuleIDs(StepFacilities),
			},
			{
				ID:      StepLevel1,
				Order:   4,
				Rewards: StepRewards{"1": 0, "2": 0, "3": 0},
				StarLabels: stepLabels(
					"Reach Level 1 (100 XP).",
					"Program XP ≥ 27 (average ≥ 2★).",
					"Program XP ≥ 54 and ≥ 2 clean friendly wins.",
				),
				AdvisorRules: stepRuleIDs(StepLevel1),
			},
		},
		ProgramXpCap: ProgramXpCap,
		Level1Xp:     Level1Xp,
		MatchXp:      MatchXpConfig{Win: MatchXpWin, Draw: MatchXpDraw, Loss: MatchXpLoss},
		Fees:         FeeConfig{Interview: InterviewFee, Scout: ScoutFee},
	}
}

func stepRuleIDs(s Step) []string {
	return []string{
		"step." + string(s) + ".arrive",
		"step." + string(s) + ".nudge",
		"step." + string(s) + ".done.1",
		"step." + string(s) + ".done.2",
		"step." + string(s) + ".done.3",
		"step." + string(s) + ".blocked",
	}
}

// Evaluate implements POST /program/evaluate. It assumes req has been
// validated by the caller (Validate) or validates it here.
func Evaluate(req ProgramEvaluateRequest) (ProgramEvaluation, error) {
	if err := req.Validate(); err != nil {
		return ProgramEvaluation{}, err
	}
	res := evaluateStep(req.Facts)
	xp := 0
	if req.Facts.Step != StepLevel1 && res.completed {
		xp = RewardXP(res.stars)
	}
	total := AddProgramXp(req.Facts.ProgramXp, xp)
	out := ProgramEvaluation{
		Step:      req.Step,
		Completed: res.completed,
		Stars:     res.stars,
		Xp:        xp,
		ProgramXp: total,
		Reasons:   res.reasons,
		Advisor:   stepAdvisorLines(req.Facts, res),
	}
	if out.Reasons == nil {
		out.Reasons = []string{}
	}
	if out.Advisor == nil {
		out.Advisor = []AdvisorLine{}
	}
	return out, nil
}

// Next implements POST /program/next.
func Next(req ProgramNextRequest) (ProgramNextResponse, error) {
	if err := req.Validate(); err != nil {
		return ProgramNextResponse{}, err
	}
	if req.Step == StepDone {
		return ProgramNextResponse{Step: StepDone, Completed: true, NextStep: StepDone}, nil
	}
	res := evaluateStep(req.Facts)
	next := req.Step
	if res.completed {
		next = req.Step.next()
	}
	return ProgramNextResponse{Step: req.Step, Completed: res.completed, NextStep: next}, nil
}
