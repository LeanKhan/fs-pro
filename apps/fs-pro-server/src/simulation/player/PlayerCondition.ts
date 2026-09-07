import type { IFieldPlayer } from '../../interfaces/Player';
import { MatchSide } from '../classes/MatchSide';
import { getSimulationConfig } from '../config';

/**
 * Milestone 20 (Fatigue, Confidence, And Player Memory) - the plan doc's
 * own `PlayerMatchCondition` sketch (Phase 26), unchanged field names.
 * Only `stamina` and `confidence` are independently tracked/mutated -
 * `fatigue`/`sharpness`/`injuryRisk` are all DERIVED from those two (plus
 * static `Age`/`Attributes.Stamina`), recomputed together by
 * `recomputeDerived()` below, rather than three more independent random
 * walks. This matches the plan doc's own explicit guidance for Phase 25's
 * `PlayerMemory` ("don't build full cognitive agents - small state is
 * enough"), applied here too: two real, independently-evolving drivers is
 * enough to make five meaningfully different numbers, without needing
 * five separately-tuned update rules.
 *
 * Still stored as five plain fields (not getters recomputed lazily) so the
 * shape matches the plan doc's flat data sketch exactly - e.g. a future
 * replay/debug payload could serialize `Condition` wholesale.
 */
export interface IPlayerCondition {
  /** 0-100, starts at 100. The one resource that only ever goes down
   * during a half (partially restored at half-time - see
   * `applyHalfTimeRecovery`). */
  stamina: number;
  /** 0-100, derived = `100 - stamina`. */
  fatigue: number;
  /** 0-100, starts neutral (`fatigue.confidence.initial`). Nudged by
   * shot/pass/dribble/tackle outcomes (`nudgeConfidence`), drifting back
   * toward neutral each tick so a bad spell doesn't permanently tank a
   * player. */
  confidence: number;
  /** 0-100, derived blend of stamina and confidence
   * (`fatigue.sharpnessStaminaWeight`). */
  sharpness: number;
  /** 0-100, derived from fatigue and `Age`. A pure risk ESTIMATE - no
   * actual injury-event system exists yet (deliberately out of this
   * milestone's scope, same "don't build more than asked" treatment as
   * everything else here); nothing currently reads this to actually
   * injure a player. */
  injuryRisk: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp100(value: number): number {
  return clamp(value, 0, 100);
}

/** Fresh state for kickoff - and, just as importantly, for a substitute:
 * `MatchSide.substitutePlayer()` constructs a brand-new `FieldPlayer` for
 * the incoming player, so calling this from `FieldPlayer`'s own
 * constructor (not lazily) means a substitute automatically starts fully
 * fresh with zero extra wiring - the same free correctness `MatchStatus`/
 * `GameStats` already get from being constructor-initialized. */
export function createInitialCondition(): IPlayerCondition {
  const initial = getSimulationConfig().fatigue.confidence.initial;
  const condition: IPlayerCondition = {
    stamina: 100,
    fatigue: 0,
    confidence: initial,
    sharpness: 100,
    injuryRisk: 0,
  };
  recomputeDerived(condition);
  return condition;
}

function recomputeDerived(condition: IPlayerCondition, age?: number): void {
  const config = getSimulationConfig().fatigue;

  condition.fatigue = clamp100(100 - condition.stamina);
  condition.sharpness = clamp100(
    condition.stamina * config.sharpnessStaminaWeight +
      condition.confidence * (1 - config.sharpnessStaminaWeight)
  );

  const ageRisk =
    age !== undefined
      ? Math.max(0, age - config.injuryRisk.ageBaseline) * config.injuryRisk.ageScale
      : 0;
  condition.injuryRisk = clamp100(
    condition.fatigue * config.injuryRisk.fatigueScale + ageRisk
  );
}

/**
 * Called once per active player, every tick, from `Game.gameLoop()` -
 * independent of who has the ball this tick, unlike almost everything
 * else in the decision/execution pipeline (which only ever runs for the
 * current ball carrier and whoever's off-ball fan-out `Actions.
 * continueGamePlay()` reaches). `pressingIntensity` is 0 for a player
 * whose side is currently IN possession - only the defending side's own
 * `Tactic.style.pressingIntensity` drains extra stamina, since that's the
 * side actually doing the pressing.
 */
export function updatePlayerConditionTick(
  player: IFieldPlayer,
  pressingIntensity: number
): void {
  const config = getSimulationConfig().fatigue;
  const condition = player.Condition;

  const abilityFactor =
    1 - (player.Attributes.Stamina / 100) * config.abilityMitigation;
  const drain =
    (config.baseDrainPerTick + pressingIntensity * config.pressingDrainScale) *
    abilityFactor;
  condition.stamina = clamp100(condition.stamina - drain);

  const driftTarget = config.confidence.initial;
  condition.confidence = clamp100(
    condition.confidence +
      (driftTarget - condition.confidence) * config.confidence.driftPerTick
  );

  recomputeDerived(condition, player.Age);
}

/** Every active player on both sides, once per tick - the actual hook
 * `Game.gameLoop()` calls. `defendingSide` is whichever side this tick's
 * `setPlayingSides()` resolved as NOT in possession (undefined on a tick
 * where no holder resolved yet - nobody presses on a loose ball, so both
 * sides just take the flat base drain that tick). */
export function updateConditionsForTick(
  sides: MatchSide[],
  defendingSide?: MatchSide
): void {
  for (const side of sides) {
    const pressingIntensity =
      side === defendingSide ? side.Tactic.style.pressingIntensity : 0;

    for (const player of side.ActivePlayers) {
      updatePlayerConditionTick(player, pressingIntensity);
    }
  }
}

/** Half-time - a real but PARTIAL recovery (`halfTimeRecoveryFraction`),
 * not a full reset; a heavily-pressed first half still shows up as lower
 * second-half stamina than a side that conserved energy, which is the
 * point. Called from `Game.ts`'s half-time transition, alongside the
 * existing formation swap/substitutions. */
export function applyHalfTimeRecovery(player: IFieldPlayer): void {
  const config = getSimulationConfig().fatigue;
  const condition = player.Condition;
  const lost = 100 - condition.stamina;
  condition.stamina = clamp100(
    condition.stamina + lost * config.halfTimeRecoveryFraction
  );
  recomputeDerived(condition, player.Age);
}

/** Milestone 20's "let repeated success/failure nudge confidence" -
 * called from `Actions.ts` at every outcome-known moment (pass complete/
 * intercepted, dribble beat/lost, tackle won/lost, shot on target/scored
 * vs missed) with `player` being whoever the outcome is actually about
 * (the passer, the dribbler, the tackler, the shooter - never the
 * opponent on the other side of the duel, which gets its own separate
 * call from the same call site when relevant). */
export function nudgeConfidence(player: IFieldPlayer, success: boolean): void {
  const config = getSimulationConfig().fatigue;
  const delta = success ? config.confidence.successDelta : config.confidence.failureDelta;
  player.Condition.confidence = clamp100(player.Condition.confidence + delta);
  recomputeDerived(player.Condition, player.Age);
}

/**
 * Milestone 20's "fatigue affects... control, tackle timing, and shot
 * precision" - a 0-1 multiplier applied to an EXECUTION-layer attribute
 * read (`TackleResolver`/`ShotResolver`), never a decision-layer score
 * (those get `Condition.confidence`'s own, separate treatment - see
 * `Decider.ts`'s `conditionConfidenceBoost()`). Bounded by
 * `executionImpact` so full fatigue degrades a player, never zeroes them
 * out - a tired world-class finisher is still better than a fresh poor
 * one, just meaningfully worse than their own fresh self.
 */
export function getFatigueMultiplier(player: IFieldPlayer): number {
  const config = getSimulationConfig().fatigue;
  return clamp(1 - (player.Condition.fatigue / 100) * config.executionImpact, 0, 1);
}
