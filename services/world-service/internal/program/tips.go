package program

import (
	"fmt"
	"sort"
	"strings"
)

// This file is the advisor rule table (contract §7): the step beats, the
// contextual tips, and the deterministic selection. All text is authored here;
// Node/2B/2C never re-author it. Money is formatted in Villa (L13).

// Villa renders a stored-Villa amount the way the client does (D2):
// V1.5M at or above a million, V1,500,000 below.
func Villa(v float64) string {
	if v >= 1_000_000 {
		return fmt.Sprintf("V%.1fM", v/1_000_000)
	}
	n := int64(v)
	neg := n < 0
	if neg {
		n = -n
	}
	s := fmt.Sprintf("%d", n)
	var parts []string
	for len(s) > 3 {
		parts = append([]string{s[len(s)-3:]}, parts...)
		s = s[:len(s)-3]
	}
	parts = append([]string{s}, parts...)
	out := "V" + strings.Join(parts, ",")
	if neg {
		out = "-" + out
	}
	return out
}

// rule is one advisor line with its trigger and presentation.
type rule struct {
	id              string
	priority        int
	dismissible     bool
	maxShows        int
	cooldownSeconds int
	once            bool
	pose            string
	target          string // "" -> null
	expr            func(StepFacts) string
	text            func(StepFacts) string
	trigger         func(StepFacts) bool
}

func (r rule) line(f StepFacts) AdvisorLine {
	var target *string
	if r.target != "" {
		t := r.target
		target = &t
	}
	pose := r.pose
	if pose == "" {
		pose = PoseIdle
	}
	return AdvisorLine{
		ID:              r.id,
		Speaker:         "vintra",
		Text:            r.text(f),
		Expr:            r.expr(f),
		Pose:            pose,
		Target:          target,
		Priority:        r.priority,
		Dismissible:     r.dismissible,
		MaxShows:        r.maxShows,
		CooldownSeconds: r.cooldownSeconds,
		Once:            r.once,
	}
}

func constText(s string) func(StepFacts) string { return func(StepFacts) string { return s } }
func constExpr(s string) func(StepFacts) string { return func(StepFacts) string { return s } }

// stepDoneTrigger fires when the given active step is complete at exactly n★.
func stepDoneTrigger(step Step, n int) func(StepFacts) bool {
	return func(f StepFacts) bool {
		if f.Step != step {
			return false
		}
		res := evaluateStep(f)
		return res.completed && int(res.stars) == n
	}
}

func stepActive(step Step) func(StepFacts) bool {
	return func(f StepFacts) bool { return f.Step == step }
}

func hasCompletedAsset(types ...string) func(StepFacts) bool {
	return func(f StepFacts) bool {
		for _, a := range completedAssets(f) {
			for _, t := range types {
				if a.Type == t {
					return true
				}
			}
		}
		return false
	}
}

// rules is the frozen advisor rule table.
var rules = []rule{
	// --- balance reveal ---
	{
		id: "balance.reveal", priority: 85, dismissible: true, maxShows: 1, once: true,
		pose: PoseIdle,
		expr: func(f StepFacts) string {
			switch {
			case f.StartingBalance >= 4_000_000:
				return ExprExcited
			case f.StartingBalance <= 1_500_000:
				return ExprWorried
			default:
				return ExprNeutral
			}
		},
		text: func(f StepFacts) string {
			v := Villa(f.StartingBalance)
			switch {
			case f.StartingBalance >= 4_000_000:
				return fmt.Sprintf("%s — the best draw on the board. Spend it like it's the last money you'll see; the league won't be gentle.", v)
			case f.StartingBalance <= 1_500_000:
				return fmt.Sprintf("We drew %s. Enough for a manager, a hard-working squad and one good building — not all three done well. Choose.", v)
			default:
				return fmt.Sprintf("%s. You can have two of the three done well. The third decides your season.", v)
			}
		},
		trigger: func(f StepFacts) bool {
			return f.Step == StepManager && f.Manager == nil && len(f.Assets) == 0 && f.Squad.Total == 0
		},
	},

	// --- manager step beats ---
	{
		id: "step.manager.arrive", priority: 80, dismissible: true, maxShows: 1,
		expr: constExpr(ExprNeutral), pose: PoseIdle,
		text:    constText("Right then. Every club needs one voice on the training pitch. Spend on a manager first — the rest waits on him."),
		trigger: func(f StepFacts) bool { return f.Step == StepManager && f.Manager == nil },
	},
	{
		id: "step.manager.nudge", priority: 72, dismissible: true, maxShows: 1, cooldownSeconds: 120,
		expr: constExpr(ExprThinking), pose: PoseIdle,
		text:    constText("Still no manager? Even a modest one beats none."),
		trigger: func(f StepFacts) bool { return f.Step == StepManager && f.Manager == nil },
	},
	{
		id: "step.manager.done.1", priority: 82, dismissible: true, maxShows: 0,
		expr: constExpr(ExprHappy), pose: PoseIdle,
		text:    constText("He'll do a job. He won't win you the league."),
		trigger: stepDoneTrigger(StepManager, 1),
	},
	{
		id: "step.manager.done.2", priority: 82, dismissible: true, maxShows: 0,
		expr: constExpr(ExprHappy), pose: PoseIdle,
		text:    constText("A steady hand. Now give him a squad that matches his style."),
		trigger: stepDoneTrigger(StepManager, 2),
	},
	{
		id: "step.manager.done.3", priority: 82, dismissible: true, maxShows: 0,
		expr: constExpr(ExprExcited), pose: PoseIdle,
		text:    constText("That's a manager who carries out a brief. Now build him a team."),
		trigger: stepDoneTrigger(StepManager, 3),
	},
	{
		id: "step.manager.blocked", priority: 92, dismissible: false, maxShows: 0,
		expr: constExpr(ExprWorried), pose: PoseIdle,
		text:    constText("Out of pocket? Sell a player or take the board advance — nobody's stuck here."),
		trigger: func(f StepFacts) bool { return f.Step == StepManager && f.Budget < CheapestManagerFee },
	},

	// --- players step beats ---
	{
		id: "step.players.arrive", priority: 80, dismissible: true, maxShows: 1,
		expr: constExpr(ExprNeutral), pose: PoseIdle,
		text: constText("A manager needs a bench. Sign a legal matchday squad — eleven, and one of them a keeper."),
		trigger: func(f StepFacts) bool {
			return f.Step == StepPlayers && !evaluateStep(f).completed
		},
	},
	{
		id: "step.players.nudge", priority: 72, dismissible: true, maxShows: 1, cooldownSeconds: 120,
		expr: constExpr(ExprWorried), pose: PoseIdle,
		text:    constText("Short of eleven. The league won't let us play, and PLAY will say so."),
		trigger: func(f StepFacts) bool { return f.Step == StepPlayers && f.Squad.Total < 11 },
	},
	{
		id: "step.players.done.1", priority: 82, dismissible: true, maxShows: 0,
		expr: constExpr(ExprHappy), pose: PoseIdle,
		text:    constText("Legal. Now make it balanced."),
		trigger: stepDoneTrigger(StepPlayers, 1),
	},
	{
		id: "step.players.done.2", priority: 82, dismissible: true, maxShows: 0,
		expr: constExpr(ExprHappy), pose: PoseIdle,
		text:    constText("A proper shape. That's a side that can win a friendly."),
		trigger: stepDoneTrigger(StepPlayers, 2),
	},
	{
		id: "step.players.done.3", priority: 82, dismissible: true, maxShows: 0,
		expr: constExpr(ExprExcited), pose: PoseIdle,
		text:    constText("Balanced, honest and paid for. That's how you survive year one."),
		trigger: stepDoneTrigger(StepPlayers, 3),
	},
	{
		id: "step.players.blocked", priority: 92, dismissible: false, maxShows: 0,
		expr: constExpr(ExprWorried), pose: PoseIdle,
		text: constText("Sell the luxury, keep the spine. We can rebuild in January."),
		trigger: func(f StepFacts) bool {
			return f.Step == StepPlayers && !evaluateStep(f).completed && f.Budget < LegalXiCost
		},
	},

	// --- facilities step beats ---
	{
		id: "step.facilities.arrive", priority: 80, dismissible: true, maxShows: 1,
		expr: constExpr(ExprNeutral), pose: PoseIdle,
		text: constText("Now build one thing that makes the next thing cheaper. Training if you'll buy young; Stands if you'll be broke."),
		trigger: func(f StepFacts) bool {
			return f.Step == StepFacilities && !evaluateStep(f).completed
		},
	},
	{
		id: "step.facilities.nudge", priority: 72, dismissible: true, maxShows: 1, cooldownSeconds: 120,
		expr: constExpr(ExprNeutral), pose: PosePointRght, target: "stands",
		text:    constText("A Tier-1 stand pays the gate fee every match."),
		trigger: func(f StepFacts) bool { return f.Step == StepFacilities && !hasCompletedAsset("stands")(f) },
	},
	{
		id: "step.facilities.done.1", priority: 82, dismissible: true, maxShows: 0,
		expr: constExpr(ExprHappy), pose: PoseIdle,
		text:    constText("Foundation laid. Now make the next thing cheaper."),
		trigger: stepDoneTrigger(StepFacilities, 1),
	},
	{
		id: "step.facilities.done.2", priority: 82, dismissible: true, maxShows: 0,
		expr: constExpr(ExprHappy), pose: PoseIdle,
		text:    constText("The right building. It compounds."),
		trigger: stepDoneTrigger(StepFacilities, 2),
	},
	{
		id: "step.facilities.done.3", priority: 82, dismissible: true, maxShows: 0,
		expr: constExpr(ExprExcited), pose: PoseIdle,
		text:    constText("Foundation laid and money left over. That's an owner's build."),
		trigger: stepDoneTrigger(StepFacilities, 3),
	},
	{
		id: "step.facilities.blocked", priority: 92, dismissible: false, maxShows: 0,
		expr: constExpr(ExprWorried), pose: PoseIdle,
		text: constText("Too dear this month? The cheapest Tier-1 still counts for the step."),
		trigger: func(f StepFacts) bool {
			return f.Step == StepFacilities && !evaluateStep(f).completed && f.Budget < 200_000
		},
	},

	// --- level1 step beats ---
	{
		id: "step.level1.arrive", priority: 80, dismissible: true, maxShows: 1,
		expr: constExpr(ExprNeutral), pose: PoseIdle,
		text: constText("One hundred XP stands between you and a real league. Wins pay 30. You need them."),
		trigger: func(f StepFacts) bool {
			return f.Step == StepLevel1 && !evaluateStep(f).completed
		},
	},
	{
		id: "step.level1.nudge", priority: 72, dismissible: true, maxShows: 1, cooldownSeconds: 120,
		expr: constExpr(ExprThinking), pose: PoseIdle,
		text:    constText("Wins are the only thing that move the Level bar now."),
		trigger: func(f StepFacts) bool { return f.Step == StepLevel1 && !evaluateStep(f).completed && f.ClubXp >= 70 },
	},
	{
		id: "step.level1.done.1", priority: 82, dismissible: true, maxShows: 0,
		expr: constExpr(ExprHappy), pose: PoseIdle,
		text:    constText("Level 1. You're in."),
		trigger: stepDoneTrigger(StepLevel1, 1),
	},
	{
		id: "step.level1.done.2", priority: 82, dismissible: true, maxShows: 0,
		expr: constExpr(ExprExcited), pose: PoseIdle,
		text:    constText("Level 1, and a build to be proud of."),
		trigger: stepDoneTrigger(StepLevel1, 2),
	},
	{
		id: "step.level1.done.3", priority: 82, dismissible: true, maxShows: 0,
		expr: constExpr(ExprExcited), pose: PoseIdle,
		text:    constText("Level 1. Your league has a name now — and so do your rivals."),
		trigger: stepDoneTrigger(StepLevel1, 3),
	},
	{
		id: "step.level1.blocked", priority: 92, dismissible: false, maxShows: 0,
		expr: constExpr(ExprWorried), pose: PoseIdle,
		text: constText("Safe start: any qualifying friendly pays the same XP on the way up."),
		trigger: func(f StepFacts) bool {
			return f.Step == StepLevel1 && !evaluateStep(f).completed && f.Friendlies.Losses > f.Friendlies.Wins
		},
	},

	// --- contextual tips (ADVISOR-SPEC §5.4) ---
	{
		id: "tip.manager.scout", priority: 55, dismissible: true, maxShows: 2, cooldownSeconds: 90,
		expr: constExpr(ExprThinking), pose: PoseIdle,
		text: constText("An interview costs V25k. It tells you exactly what you're buying. Skip it and you're guessing."),
		trigger: func(f StepFacts) bool {
			return f.Step == StepManager && f.Manager == nil && f.Scout.ManagersBrowsed >= 3
		},
	},
	{
		id: "tip.manager.wage", priority: 60, dismissible: true, maxShows: 1, once: true,
		expr: constExpr(ExprWorried), pose: PoseIdle,
		text: constText("That wage eats the budget. A cheaper voice leaves money for players."),
		trigger: func(f StepFacts) bool {
			return f.Manager != nil && f.Manager.Wage > 0.40*f.StartingBalance
		},
	},
	{
		id: "tip.squad.keeper", priority: 95, dismissible: false, maxShows: 3, cooldownSeconds: 30,
		expr: constExpr(ExprWorried), pose: PoseIdle,
		text:    constText("No keeper, no match. Sort the gloves first."),
		trigger: func(f StepFacts) bool { return f.Step == StepPlayers && f.Squad.Total >= 11 && f.Squad.GK == 0 },
	},
	{
		id: "tip.squad.afford", priority: 98, dismissible: false, maxShows: 3, cooldownSeconds: 30,
		expr: constExpr(ExprWorried), pose: PoseIdle,
		text:    constText("The cheapest legal XI is beyond us. Scout, sell, or take the board advance."),
		trigger: func(f StepFacts) bool { return f.Step == StepPlayers && f.Budget < LegalXiCost },
	},
	{
		id: "tip.facility.stand", priority: 55, dismissible: true, maxShows: 2, cooldownSeconds: 120,
		expr: constExpr(ExprNeutral), pose: PosePointRght, target: "stands",
		text: constText("A Tier-1 stand pays the gate fee every match."),
		trigger: func(f StepFacts) bool {
			return f.Step == StepFacilities && !hasCompletedAsset("stands")(f)
		},
	},
	{
		id: "tip.facility.cheap", priority: 90, dismissible: true, maxShows: 2, cooldownSeconds: 60,
		expr: constExpr(ExprWorried), pose: PoseIdle,
		text:    constText("The cheapest Tier-1 still counts for the step."),
		trigger: func(f StepFacts) bool { return f.Step == StepFacilities && f.Budget < 200_000 },
	},
	{
		id: "tip.level.training", priority: 50, dismissible: true, maxShows: 1, cooldownSeconds: 300,
		expr: constExpr(ExprThinking), pose: PosePointRght, target: "staff_house",
		text: constText("No training ground yet. It compounds every young player you sign."),
		trigger: func(f StepFacts) bool {
			return f.Step == StepLevel1 && f.ClubXp >= 70 && !hasCompletedAsset("training_ground")(f)
		},
	},
	{
		id: "tip.play.gate", priority: 100, dismissible: false, maxShows: 5,
		expr: constExpr(ExprWorried), pose: PoseIdle,
		text:    constText("Can't play yet — you need a manager and a legal XI."),
		trigger: func(f StepFacts) bool { return f.Events.PlayBlocked },
	},
	{
		id: "tip.recovery.board", priority: 96, dismissible: false, maxShows: 2, cooldownSeconds: 120,
		expr: constExpr(ExprWorried), pose: PoseIdle,
		text:    constText("Funds are low. The board can advance you a loan for a fee."),
		trigger: func(f StepFacts) bool { return f.Budget < 50_000 },
	},
	{
		id: "tip.milestone.manager", priority: 45, dismissible: true, maxShows: 1, once: true,
		expr: constExpr(ExprHappy), pose: PoseIdle,
		text:    constText("First manager through the door. Onwards."),
		trigger: func(f StepFacts) bool { return f.Manager != nil },
	},
	{
		id: "tip.idle.break", priority: 15, dismissible: true, maxShows: 1, once: true,
		expr: constExpr(ExprNeutral), pose: PoseIdle,
		text:    constText("You've been at this a while. The club will keep."),
		trigger: func(f StepFacts) bool { return f.Events.SessionMinutes >= 90 },
	},
	{
		id: "tip.veteran.quiet", priority: 30, dismissible: true, maxShows: 1, once: true,
		expr: constExpr(ExprNeutral), pose: PoseIdle,
		text:    constText("You've done this before. I'll keep quiet unless you need me."),
		trigger: func(f StepFacts) bool { return f.Events.ProgramCompletedOnce },
	},
}

// QuietPriorityFloor is the priority below which tips go silent when the owner
// has "quiet tips" on (program-step and blocked lines still show).
const QuietPriorityFloor = 70

// Tip implements POST /program/tip: the single highest-priority eligible line.
func Tip(req ProgramTipRequest) (ProgramTipResponse, error) {
	if err := req.Validate(); err != nil {
		return ProgramTipResponse{}, err
	}
	dismissed := make(map[string]bool, len(req.Advisor.Dismissed))
	for _, id := range req.Advisor.Dismissed {
		dismissed[id] = true
	}

	var eligible []AdvisorLine
	for _, r := range rules {
		if !r.trigger(req.Facts) {
			continue
		}
		if dismissed[r.id] {
			continue
		}
		shows := req.Advisor.Shows[r.id]
		if r.maxShows > 0 && shows >= r.maxShows {
			continue
		}
		if r.once && shows >= 1 {
			continue
		}
		if r.cooldownSeconds > 0 {
			if last, ok := req.Advisor.LastShownAt[r.id]; ok && req.Now-last < int64(r.cooldownSeconds)*1000 {
				continue
			}
		}
		if req.Advisor.Quiet && r.priority < QuietPriorityFloor {
			continue
		}
		eligible = append(eligible, r.line(req.Facts))
	}
	if len(eligible) == 0 {
		return ProgramTipResponse{Tip: nil}, nil
	}
	sort.SliceStable(eligible, func(i, j int) bool {
		if eligible[i].Priority != eligible[j].Priority {
			return eligible[i].Priority > eligible[j].Priority
		}
		return eligible[i].ID < eligible[j].ID
	})
	tip := eligible[0]
	return ProgramTipResponse{Tip: &tip}, nil
}

// stepAdvisorLines returns the step's best framing line for POST
// /program/evaluate: the highest-priority line of this step whose trigger
// holds. No advisor state is applied here (the tips endpoint owns cooldowns).
func stepAdvisorLines(f StepFacts, res stepResult) []AdvisorLine {
	_ = res // stars are recomputed by the step-done triggers, keeping one source
	prefix := "step." + string(f.Step) + "."
	var eligible []AdvisorLine
	for _, r := range rules {
		if !strings.HasPrefix(r.id, prefix) {
			continue
		}
		if r.trigger(f) {
			eligible = append(eligible, r.line(f))
		}
	}
	if len(eligible) == 0 {
		return nil
	}
	sort.SliceStable(eligible, func(i, j int) bool {
		if eligible[i].Priority != eligible[j].Priority {
			return eligible[i].Priority > eligible[j].Priority
		}
		return eligible[i].ID < eligible[j].ID
	})
	return eligible[:1]
}
