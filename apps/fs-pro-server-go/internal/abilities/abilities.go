// Package abilities is the Gated Abilities core (docs/coc-mapping/03 §2, 07 §1a):
// the ability registry (content), mastery tiers, slot counts and the
// facility-tier x mastery-tier gate. The numbers live here; sim-core implements
// the small fixed set of Effect kinds. Pure so the rules are table-testable.
package abilities

// EffectKind is a mechanism sim-core implements (07 §1a). Content supplies params.
type EffectKind string

// The effect mechanisms.
const (
	EffectTendency      EffectKind = "tendency"       // a tendency/behaviour delta
	EffectNewAction     EffectKind = "new_action"     // unlock a decider action
	EffectCrossType     EffectKind = "cross_type"     // change cross delivery
	EffectHeaderQuality EffectKind = "header_quality" // aerial/header modifier
	EffectInterception  EffectKind = "interception"   // passing-lane interception
	EffectStaminaSurge  EffectKind = "stamina_surge"  // late-game stamina
	EffectShotQuality   EffectKind = "shot_quality"   // finishing modifier
)

// SimKind is the wire `kind` sim-core's RawEffect expects (07 §1a). The
// registry uses snake ids for content; the engine uses the camel-case mechanism
// names, so this is the single translation point.
func (k EffectKind) SimKind() string {
	switch k {
	case EffectTendency:
		return "Tendency"
	case EffectNewAction:
		return "NewAction"
	case EffectCrossType:
		return "CrossType"
	case EffectHeaderQuality:
		return "HeaderQuality"
	case EffectInterception:
		return "Interception"
	case EffectStaminaSurge:
		return "StaminaSurge"
	case EffectShotQuality:
		return "ShotQuality"
	default:
		return ""
	}
}

// ActionCodeParam is the RawEffect param key a NewAction effect uses to name the
// decider action it unlocks (07 §1a; sim-core action codes 1..5).
const ActionCodeParam = "action"

// Action codes sim-core resolves from RawEffect{kind:"NewAction"} (07 §1a).
const (
	ActionTacticalFoul = 1
	ActionVolley       = 2
	ActionTrivela      = 3
	ActionThroughBall  = 4
	ActionSweeperRush  = 5
)

// Family is the player archetype an ability belongs to.
type Family string

// The ability families.
const (
	FamilyALL Family = "ALL"
	FamilyGK  Family = "GK"
	FamilyDEF Family = "DEF"
	FamilyMID Family = "MID"
	FamilyATT Family = "ATT"
)

// TriggerWhen is when an ability fires (matched deterministically in the engine).
// The wire values are the snake ids sim-core's `TriggerWhen::parse` accepts.
type TriggerWhen string

// The trigger conditions. These mirror the engine's `TriggerWhen` set (07 §2.6);
// a trigger that no engine fact can express must stay `Always` (documented on
// the registry row) rather than be approximated with an unrelated condition.
const (
	Always          TriggerWhen = "always"
	MinuteAtLeast   TriggerWhen = "minute_at_least"
	Trailing        TriggerWhen = "trailing"
	Leading         TriggerWhen = "leading"
	Drawing         TriggerWhen = "drawing"
	StaminaBelow    TriggerWhen = "stamina_below"
	MomentumBelow   TriggerWhen = "momentum_below"
	PossessionBelow TriggerWhen = "possession_below"
	ScorelineEquals TriggerWhen = "scoreline_equals"
	PhaseIs         TriggerWhen = "phase_is"
)

// Ability is one registry entry.
type Ability struct {
	ID           string
	Name         string
	Family       Family
	FacilityTier int
	MasteryTier  int
	Trigger      TriggerWhen
	// TriggerThreshold is the numeric argument a threshold trigger reads
	// (MinuteAtLeast/StaminaBelow/PossessionBelow/MomentumBelow/
	// ScorelineEquals/PhaseIs). Ignored by Always/Trailing/Leading/Drawing.
	TriggerThreshold float64
	Effect           EffectKind
	Params           map[string]float64
}

// Registry is the ability catalogue (03 §2.3). Content - tunable without engine
// changes as long as each Effect maps to an implemented kind.
//
// The `Trigger` column is the match-context gate (vector 3, 03 §2.1): the engine
// only activates the effect while the trigger holds. The shipped engine facts
// are team-level (minute, scoreline, stamina, possession/momentum, half), so a
// catalog context that is purely *spatial* ("pressed in own third", "cross
// incoming", "long ball over the top") cannot be expressed yet and stays
// `Always` with a note. Re-deriving those as a trigger needs a spatial fact the
// engine does not emit (OW-P03 remainder).
var Registry = []Ability{
	// DEF; catalog "pressed in own third". Own-third pressure is spatial, so the
	// closest team fact is a *low share of the ball* (defending under the cosh).
	{ID: "clear_under_pressure", Name: "Clear Under Pressure", Family: FamilyDEF, FacilityTier: 0, MasteryTier: 1, Trigger: PossessionBelow, TriggerThreshold: 45, Effect: EffectTendency},
	{ID: "standard_ground_pass", Name: "Standard Ground Pass", Family: FamilyALL, FacilityTier: 0, MasteryTier: 1, Trigger: Always, Effect: EffectTendency},
	{ID: "whipped_cross", Name: "Whipped Cross", Family: FamilyMID, FacilityTier: 1, MasteryTier: 2, Trigger: Always, Effect: EffectCrossType, Params: map[string]float64{"inswing": 1}},
	// DEF; catalog "opponent in transition, danger zone" - a transition break is
	// taken while chasing (men committed forward, exposed at the back).
	{ID: "tactical_foul", Name: "Tactical Foul", Family: FamilyDEF, FacilityTier: 1, MasteryTier: 2, Trigger: Trailing, Effect: EffectNewAction, Params: map[string]float64{ActionCodeParam: ActionTacticalFoul}},
	{ID: "near_post_run", Name: "Near-Post Run", Family: FamilyATT, FacilityTier: 1, MasteryTier: 2, Trigger: Always, Effect: EffectTendency},
	// MID; catalog "defensive line high + runner in behind". You lead, so the
	// opponent pushes a high line to chase and the space in behind opens up.
	{ID: "through_ball_in_behind", Name: "Through Ball in Behind", Family: FamilyMID, FacilityTier: 2, MasteryTier: 3, Trigger: Leading, Effect: EffectNewAction, Params: map[string]float64{ActionCodeParam: ActionThroughBall}},
	// OW-P04: this NewAction carries no action code, so the effect is inert in
	// the engine until sim-core adds a slide-tackle-recovery ActionChoice (which
	// would need its own decider EV term, model probability and action tag). Kept
	// data-only rather than shipping a fake code that unlocks nothing.
	{ID: "slide_tackle_recovery", Name: "Slide Tackle Recovery", Family: FamilyDEF, FacilityTier: 2, MasteryTier: 3, Trigger: Always, Effect: EffectNewAction},
	{ID: "sweeper_keeper_rush", Name: "Sweeper-Keeper Rush", Family: FamilyGK, FacilityTier: 2, MasteryTier: 3, Trigger: Always, Effect: EffectNewAction, Params: map[string]float64{ActionCodeParam: ActionSweeperRush}},
	{ID: "third_man_run", Name: "Third-Man Run", Family: FamilyMID, FacilityTier: 3, MasteryTier: 4, Trigger: Always, Effect: EffectTendency},
	// OW-P04: like slide_tackle_recovery, this NewAction has no action code and
	// stays inert until sim-core ships a weak-foot cut-inside shot action.
	{ID: "inverted_cut_and_shoot", Name: "Inverted Cut & Shoot", Family: FamilyATT, FacilityTier: 3, MasteryTier: 4, Trigger: Always, Effect: EffectNewAction},
	// ATT; catalog "opponent build-up from keeper". Mirrors the War Room
	// "press_trap" order, which springs on a level game.
	{ID: "high_press_trap", Name: "High Press Trap", Family: FamilyATT, FacilityTier: 3, MasteryTier: 4, Trigger: Drawing, Effect: EffectTendency},
	{ID: "trivela_switch", Name: "Trivela Switch", Family: FamilyMID, FacilityTier: 4, MasteryTier: 5, Trigger: Always, Effect: EffectNewAction, Params: map[string]float64{ActionCodeParam: ActionTrivela}},
	// DEF; catalog "opponent through-ball threat" - you hold a lead and step the
	// line up in unison to spring the offside trap.
	{ID: "offside_trap_step_up", Name: "Offside Trap Step-Up", Family: FamilyDEF, FacilityTier: 4, MasteryTier: 5, Trigger: Leading, Effect: EffectTendency},
	{ID: "talisman_second_wind", Name: "Talisman Second Wind", Family: FamilyALL, FacilityTier: 4, MasteryTier: 5, Trigger: StaminaBelow, TriggerThreshold: 35, Effect: EffectStaminaSurge, Params: map[string]float64{"below": 35, "amount": 15}},
	{ID: "poachers_blindside", Name: "Poacher's Blindside", Family: FamilyATT, FacilityTier: 2, MasteryTier: 3, Trigger: Always, Effect: EffectHeaderQuality, Params: map[string]float64{"bonus": 0.25}},
	// First-Time Volley is the 16th 03 §2.3 row. The catalogue prints it as
	// "Elite + mastery 20"; the shipped 1..5 mastery scale and the 0..5 facility
	// scale have no such tier, so it lands at the top of both (facility 4,
	// mastery 5). Data-only: the Effect maps to sim-core's existing Volley
	// action, so no engine change is required to carry it.
	{ID: "first_time_volley", Name: "First-Time Volley", Family: FamilyATT, FacilityTier: 4, MasteryTier: 5, Trigger: Always, Effect: EffectNewAction, Params: map[string]float64{ActionCodeParam: ActionVolley}},
}

// Mastery XP thresholds per tier: tier 1 starts at 0.
var masteryThresholds = [6]int{0, 0, 500, 1500, 3500, 7000}

// MaxMasteryTier is the highest mastery tier.
const MaxMasteryTier = 5

// MasteryTierForXp is the mastery tier a player's XP earns (1..5).
func MasteryTierForXp(xp int) int {
	tier := 1
	for t := 2; t <= MaxMasteryTier; t++ {
		if xp >= masteryThresholds[t] {
			tier = t
		}
	}
	return tier
}

// SlotCount is how many abilities a player may hold: 1 (rookie), 2 (starter) or
// 3 (star/veteran). Mastery above 3 does not add slots.
func SlotCount(masteryTier int) int {
	if masteryTier < 1 {
		return 1
	}
	if masteryTier > 3 {
		return 3
	}
	return masteryTier
}

// CanLearn reports whether a player on a facility/mastery tier may slot an
// ability: both gates must be met.
func CanLearn(a Ability, facilityTier, masteryTier int) bool {
	return a.FacilityTier <= facilityTier && a.MasteryTier <= masteryTier
}

// Eligible returns the abilities a player of `family` may learn at a facility
// and mastery tier, in registry order.
func Eligible(family Family, facilityTier, masteryTier int) []Ability {
	var out []Ability
	for _, a := range Registry {
		if a.Family != FamilyALL && a.Family != family {
			continue
		}
		if CanLearn(a, facilityTier, masteryTier) {
			out = append(out, a)
		}
	}
	return out
}
