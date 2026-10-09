// Package program is the pure owner-program engine: step definitions,
// completion predicates, 1–3 star scoring, reward tables, tip rules and the
// balance simulator (docs/perfect/phase-2/PROGRAM-SERVICE-CONTRACT.md).
//
// It is deliberately pure: no database, no clock, no global randomness. Node
// reads facts, calls these functions over HTTP, and writes every money/XP
// ledger itself (R3′). The same request always produces the same response, so
// the boundary is replayable and testable.
package program

import "fmt"

// Step is an active program step. The persisted OwnerProgram.Step enum also
// has "not_started" and "done"; only the four active steps are ever evaluated.
type Step string

const (
	StepManager    Step = "manager"
	StepPlayers    Step = "players"
	StepFacilities Step = "facilities"
	StepLevel1     Step = "level1"
	StepDone       Step = "done"
)

// stepOrder is the strict guidance order (spec §3.1).
var stepOrder = []Step{StepManager, StepPlayers, StepFacilities, StepLevel1}

// IsActiveStep reports whether s is one of the four evaluable steps.
func (s Step) IsActiveStep() bool {
	for _, x := range stepOrder {
		if x == s {
			return true
		}
	}
	return false
}

// next returns the step after s in the guidance order, or StepDone after the
// last one.
func (s Step) next() Step {
	for i, x := range stepOrder {
		if x == s {
			if i+1 < len(stepOrder) {
				return stepOrder[i+1]
			}
			return StepDone
		}
	}
	return StepDone
}

// ManagerFacts is the signed manager, or nil when unsigned.
type ManagerFacts struct {
	Overall       int     `json:"overall"`
	Tactics       int     `json:"tactics"`
	Motivation    int     `json:"motivation"`
	Development   int     `json:"development"`
	Discipline    int     `json:"discipline"`
	SigningFee    float64 `json:"signingFee"`
	Wage          float64 `json:"wage"`
	ContractYears int     `json:"contractYears"`
}

// SquadFacts is the squad census.
type SquadFacts struct {
	Total        int     `json:"total"`
	GK           int     `json:"gk"`
	Def          int     `json:"def"`
	Mid          int     `json:"mid"`
	Att          int     `json:"att"`
	MedianRating float64 `json:"medianRating"`
}

// AssetFacts is one ClubAssets row.
type AssetFacts struct {
	Type        string `json:"type"`
	Tier        int    `json:"tier"`
	UpgradingTo *int   `json:"upgradingTo"`
	HasEffect   bool   `json:"hasEffect"`
}

// FriendlyFacts is the Level-0 qualifying-friendly record.
type FriendlyFacts struct {
	Wins   int `json:"wins"`
	Draws  int `json:"draws"`
	Losses int `json:"losses"`
}

// ScoutFacts describes what the owner has already scouted/interviewed.
type ScoutFacts struct {
	ManagersBrowsed    int      `json:"managersBrowsed"`
	InterviewedManager []string `json:"interviewedManagerIds"`
	ScoutedPlayer      []string `json:"scoutedPlayerIds"`
}

// EventFacts are advisor-relevant event flags.
type EventFacts struct {
	PlayBlocked          bool    `json:"playBlocked"`
	SessionMinutes       float64 `json:"sessionMinutes"`
	ProgramCompletedOnce bool    `json:"programCompletedOnce"`
}

// StepFacts is the whole pure input snapshot (contract §1.2).
type StepFacts struct {
	Step            Step          `json:"step"`
	StartingBalance float64       `json:"startingBalance"`
	Budget          float64       `json:"budget"`
	Manager         *ManagerFacts `json:"manager"`
	Squad           SquadFacts    `json:"squad"`
	Assets          []AssetFacts  `json:"assets"`
	ProgramXp       int           `json:"programXp"`
	ClubXp          int           `json:"clubXp"`
	Friendlies      FriendlyFacts `json:"friendlies"`
	Scout           ScoutFacts    `json:"scout"`
	Events          EventFacts    `json:"events"`
}

// Stars is a 1–3 decision-quality rating; 0 means not completed.
type Stars int

// Advisor expression and pose enums (ADVISOR-SPEC §5.1).
const (
	ExprNeutral  = "neutral"
	ExprHappy    = "happy"
	ExprExcited  = "excited"
	ExprWorried  = "worried"
	ExprThinking = "thinking"

	PoseIdle      = "idle"
	PosePointRght = "point-right"
	PosePointLeft = "point-left"
)

// AdvisorLine is one rendered advisor line (contract §1.3).
type AdvisorLine struct {
	ID              string  `json:"id"`
	Speaker         string  `json:"speaker"`
	Text            string  `json:"text"`
	Expr            string  `json:"expr"`
	Pose            string  `json:"pose"`
	Target          *string `json:"target"`
	Priority        int     `json:"priority"`
	Dismissible     bool    `json:"dismissible"`
	MaxShows        int     `json:"maxShows"`
	CooldownSeconds int     `json:"cooldownSeconds"`
	Once            bool    `json:"once"`
}

// ProgramEvaluateRequest is the POST /program/evaluate body.
type ProgramEvaluateRequest struct {
	Step  Step      `json:"step"`
	Facts StepFacts `json:"facts"`
}

// ProgramEvaluation is the POST /program/evaluate response.
type ProgramEvaluation struct {
	Step      Step          `json:"step"`
	Completed bool          `json:"completed"`
	Stars     Stars         `json:"stars"`
	Xp        int           `json:"xp"`
	ProgramXp int           `json:"programXp"`
	Reasons   []string      `json:"reasons"`
	Advisor   []AdvisorLine `json:"advisor"`
}

// ProgramNextRequest is the POST /program/next body.
type ProgramNextRequest struct {
	Step  Step      `json:"step"`
	Facts StepFacts `json:"facts"`
}

// ProgramNextResponse is the POST /program/next response.
type ProgramNextResponse struct {
	Step      Step `json:"step"`
	Completed bool `json:"completed"`
	NextStep  Step `json:"nextStep"`
}

// AdvisorState is the caller-supplied advisor state for POST /program/tip.
type AdvisorState struct {
	Shows       map[string]int   `json:"shows"`
	LastShownAt map[string]int64 `json:"lastShownAt"`
	Dismissed   []string         `json:"dismissed"`
	Quiet       bool             `json:"quiet"`
}

// ProgramTipRequest is the POST /program/tip body.
type ProgramTipRequest struct {
	Facts   StepFacts    `json:"facts"`
	Advisor AdvisorState `json:"advisor"`
	Now     int64        `json:"now"`
}

// ProgramTipResponse is the POST /program/tip response.
type ProgramTipResponse struct {
	Tip *AdvisorLine `json:"tip"`
}

// ProgramSimulateRequest is the POST /program/simulate body.
type ProgramSimulateRequest struct {
	Balance  float64 `json:"balance"`
	Strategy string  `json:"strategy"`
	Runs     int     `json:"runs"`
	Seed     int64   `json:"seed"`
}

// Validate enforces the contract's request constraints.
func (r ProgramEvaluateRequest) Validate() error {
	if !r.Step.IsActiveStep() {
		return fmt.Errorf("step must be one of manager, players, facilities, level1")
	}
	if r.Facts.Step != r.Step {
		return fmt.Errorf("step and facts.step disagree")
	}
	return r.Facts.validate()
}

// Validate enforces the contract's request constraints.
func (r ProgramNextRequest) Validate() error {
	if !r.Step.IsActiveStep() && r.Step != StepDone {
		return fmt.Errorf("step must be one of manager, players, facilities, level1, done")
	}
	if r.Facts.Step != r.Step {
		return fmt.Errorf("step and facts.step disagree")
	}
	if r.Step == StepDone {
		return nil
	}
	return r.Facts.validate()
}

// Validate enforces the contract's request constraints.
func (r ProgramTipRequest) Validate() error {
	if r.Now <= 0 {
		return fmt.Errorf("now must be a positive epoch-milliseconds value")
	}
	return r.Facts.validate()
}

func (f StepFacts) validate() error {
	if !f.Step.IsActiveStep() {
		return fmt.Errorf("facts.step must be one of manager, players, facilities, level1")
	}
	if f.Squad.Total < 0 || f.Squad.GK < 0 || f.Squad.Def < 0 || f.Squad.Mid < 0 || f.Squad.Att < 0 {
		return fmt.Errorf("squad counts must not be negative")
	}
	if f.Friendlies.Wins < 0 || f.Friendlies.Draws < 0 || f.Friendlies.Losses < 0 {
		return fmt.Errorf("friendly counts must not be negative")
	}
	if f.ProgramXp < 0 || f.ClubXp < 0 {
		return fmt.Errorf("xp must not be negative")
	}
	return nil
}
