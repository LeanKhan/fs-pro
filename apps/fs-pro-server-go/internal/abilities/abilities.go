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
type TriggerWhen string

// The trigger conditions.
const (
	Always          TriggerWhen = "always"
	MinuteAtLeast   TriggerWhen = "minute_at_least"
	Trailing        TriggerWhen = "trailing"
	Leading         TriggerWhen = "leading"
	Drawing         TriggerWhen = "drawing"
	StaminaBelow    TriggerWhen = "stamina_below"
	MomentumBelow   TriggerWhen = "momentum_below"
	PossessionBelow TriggerWhen = "possession_below"
)

// Ability is one registry entry.
type Ability struct {
	ID           string
	Name         string
	Family       Family
	FacilityTier int
	MasteryTier  int
	Trigger      TriggerWhen
	Effect       EffectKind
	Params       map[string]float64
}

// Registry is the ability catalogue (03 §2.3). Content - tunable without engine
// changes as long as each Effect maps to an implemented kind.
var Registry = []Ability{
	{ID: "clear_under_pressure", Name: "Clear Under Pressure", Family: FamilyDEF, FacilityTier: 0, MasteryTier: 1, Trigger: Always, Effect: EffectTendency},
	{ID: "standard_ground_pass", Name: "Standard Ground Pass", Family: FamilyALL, FacilityTier: 0, MasteryTier: 1, Trigger: Always, Effect: EffectTendency},
	{ID: "whipped_cross", Name: "Whipped Cross", Family: FamilyMID, FacilityTier: 1, MasteryTier: 2, Trigger: Always, Effect: EffectCrossType, Params: map[string]float64{"inswing": 1}},
	{ID: "tactical_foul", Name: "Tactical Foul", Family: FamilyDEF, FacilityTier: 1, MasteryTier: 2, Trigger: Always, Effect: EffectNewAction, Params: map[string]float64{ActionCodeParam: ActionTacticalFoul}},
	{ID: "near_post_run", Name: "Near-Post Run", Family: FamilyATT, FacilityTier: 1, MasteryTier: 2, Trigger: Always, Effect: EffectTendency},
	{ID: "through_ball_in_behind", Name: "Through Ball in Behind", Family: FamilyMID, FacilityTier: 2, MasteryTier: 3, Trigger: Always, Effect: EffectNewAction, Params: map[string]float64{ActionCodeParam: ActionThroughBall}},
	{ID: "slide_tackle_recovery", Name: "Slide Tackle Recovery", Family: FamilyDEF, FacilityTier: 2, MasteryTier: 3, Trigger: Always, Effect: EffectNewAction},
	{ID: "sweeper_keeper_rush", Name: "Sweeper-Keeper Rush", Family: FamilyGK, FacilityTier: 2, MasteryTier: 3, Trigger: Always, Effect: EffectNewAction, Params: map[string]float64{ActionCodeParam: ActionSweeperRush}},
	{ID: "third_man_run", Name: "Third-Man Run", Family: FamilyMID, FacilityTier: 3, MasteryTier: 4, Trigger: Always, Effect: EffectTendency},
	{ID: "inverted_cut_and_shoot", Name: "Inverted Cut & Shoot", Family: FamilyATT, FacilityTier: 3, MasteryTier: 4, Trigger: Always, Effect: EffectNewAction},
	{ID: "high_press_trap", Name: "High Press Trap", Family: FamilyATT, FacilityTier: 3, MasteryTier: 4, Trigger: Always, Effect: EffectTendency},
	{ID: "trivela_switch", Name: "Trivela Switch", Family: FamilyMID, FacilityTier: 4, MasteryTier: 5, Trigger: Always, Effect: EffectNewAction, Params: map[string]float64{ActionCodeParam: ActionTrivela}},
	{ID: "offside_trap_step_up", Name: "Offside Trap Step-Up", Family: FamilyDEF, FacilityTier: 4, MasteryTier: 5, Trigger: Always, Effect: EffectTendency},
	{ID: "talisman_second_wind", Name: "Talisman Second Wind", Family: FamilyALL, FacilityTier: 4, MasteryTier: 5, Trigger: StaminaBelow, Effect: EffectStaminaSurge, Params: map[string]float64{"below": 35, "amount": 15}},
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
