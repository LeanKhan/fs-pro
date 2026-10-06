/**
 * Outcome models - the probability that an attempted action succeeds.
 *
 * Every model is a log-odds sum:
 *
 *   situation (geometry, pressure, tactical context)  -> base log-odds
 *   + (attacker skill - pivot) / scale
 *   - (defender skill - pivot) / scale
 *   -> sigmoid -> one random draw
 *
 * Why log-odds: effects compose without ever leaving [0,1], and every
 * `*Scale` in OutcomesConfig has one meaning ("attribute points per +1
 * log-odds"), so how much quality matters per action is a single,
 * measurable dial (see scripts/agencyCheck.ts) instead of being spread
 * across ad-hoc win/lose rolls.
 *
 * Pure functions of their inputs (no RNG, no mutation) - resolvers draw
 * the random number, so the probabilities themselves can be logged as xG
 * and tested in isolation.
 */
import { IFieldPlayer, IPlayerAttributes } from '../../interfaces/Player';
import { MatchSide } from '../classes/MatchSide';
import { ICoordinate } from '../state/ImmutableState/FieldGrid';
import CO from '../utils/coordinates';
import { getSimulationConfig } from '../config';
import { getFatigueMultiplier } from '../player/PlayerCondition';
import { getPressure } from '../spatial/PressureAnalyzer';
import { getPassingLane } from '../spatial/PassingAnalyzer';
import { getGoalDistance } from '../spatial/SpatialAnalyzer';

export type NumericAttribute =
  | 'Speed' | 'Shooting' | 'LongPass' | 'ShortPass' | 'Mental' | 'Tackling'
  | 'Keeping' | 'Control' | 'Strength' | 'Stamina' | 'SetPiece' | 'Dribbling'
  | 'Vision' | 'ShotPower' | 'Aggression' | 'Interception' | 'Marking'
  | 'Agility' | 'Crossing' | 'Positioning' | 'LongShot';

export type SkillWeights = Partial<Record<NumericAttribute, number>>;

export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

export const logit = (p: number): number => {
  const q = Math.min(0.999, Math.max(0.001, p));
  return Math.log(q / (1 - q));
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Weighted average of a player's attributes (weights need not sum to 1),
 * reduced by match fatigue - a tired player executes worse. */
export function skill(player: IFieldPlayer, weights: SkillWeights): number {
  let total = 0;
  let weightSum = 0;
  for (const [attr, w] of Object.entries(weights) as [NumericAttribute, number][]) {
    total += (Number(player.Attributes[attr]) || 0) * w;
    weightSum += w;
  }
  return weightSum ? (total / weightSum) * getFatigueMultiplier(player) : 0;
}

/** Blend two weight sets: `t` = 0 -> a, 1 -> b. */
export function blendWeights(a: SkillWeights, b: SkillWeights, t: number): SkillWeights {
  const out: SkillWeights = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<NumericAttribute>) {
    out[k] = (a[k] ?? 0) * (1 - t) + (b[k] ?? 0) * t;
  }
  return out;
}

/** Real-pitch metres between two grid positions. */
export function metresBetween(a: ICoordinate, b: ICoordinate): number {
  const { lengthMetres, widthMetres } = getSimulationConfig().outcomes.pitch;
  const field = CO.co.Field;
  const mx = (Math.abs(a.x - b.x) * lengthMetres) / Math.max(1, field.mapWidth - 1);
  const my = (Math.abs(a.y - b.y) * widthMetres) / Math.max(1, field.mapHeight - 1);
  return Math.hypot(mx, my);
}

/** Distance (m) to the goal centre and the angle (rad) of goal mouth the
 * shooter can see - the two inputs every public xG model starts from. */
export function shotGeometry(from: ICoordinate, goal: ICoordinate) {
  const { lengthMetres, widthMetres, goalWidthMetres } = getSimulationConfig().outcomes.pitch;
  const field = CO.co.Field;
  // At least a metre out - a shooter on the goal-line block is still in
  // front of the line, not on it.
  const x = Math.max(1, (Math.abs(goal.x - from.x) * lengthMetres) / Math.max(1, field.mapWidth - 1));
  const y = (Math.abs(goal.y - from.y) * widthMetres) / Math.max(1, field.mapHeight - 1);
  const half = goalWidthMetres / 2;
  const angle = Math.atan2(goalWidthMetres * x, x * x + y * y - half * half);
  return { distance: Math.hypot(x, y), angle: angle < 0 ? angle + Math.PI : angle };
}

const outfield = (side: MatchSide) => side.ActivePlayers.filter((p) => p.Position !== 'GK');

/** Defenders physically between the ball and the goal, close enough to the
 * line of the shot to block it. */
export function shotBlockers(shooter: IFieldPlayer, goal: ICoordinate, defendingSide: MatchSide): number {
  const shooterToGoal = getGoalDistance(shooter.BlockPosition, goal);
  return outfield(defendingSide).filter(
    (d) =>
      getGoalDistance(d.BlockPosition, goal) < shooterToGoal &&
      CO.co.distanceToSegment(d.BlockPosition, shooter.BlockPosition, goal) <= 1
  ).length;
}

/** The shooter is beyond every outfield defender - only the keeper to beat. */
export function isClearThrough(shooter: IFieldPlayer, goal: ICoordinate, defendingSide: MatchSide): boolean {
  const shooterToGoal = getGoalDistance(shooter.BlockPosition, goal);
  return outfield(defendingSide).every((d) => getGoalDistance(d.BlockPosition, goal) >= shooterToGoal);
}

const SHOOTER_NEAR: SkillWeights = { Shooting: 0.6, Mental: 0.2, Positioning: 0.15, ShotPower: 0.05 };
const SHOOTER_FAR: SkillWeights = { LongShot: 0.55, ShotPower: 0.25, Mental: 0.15, Positioning: 0.05 };
const PENALTY_TAKER: SkillWeights = { SetPiece: 0.4, Shooting: 0.3, Mental: 0.3 };
const FREE_KICK_TAKER: SkillWeights = { SetPiece: 0.5, LongShot: 0.3, ShotPower: 0.2 };
const KEEPER: SkillWeights = { Keeping: 0.55, Positioning: 0.2, Agility: 0.15, Mental: 0.1 };
/** A keeper missing from the pitch (sent off, no GK named) - an outfielder
 * in gloves. */
const NO_KEEPER_SKILL = 20;

export type ShotKind = 'open-play' | 'penalty' | 'free-kick';

export interface ShotModel {
  /** Chance quality from the situation alone - what a league-average
   * finisher would score against a league-average keeper. */
  xG: number;
  /** Actual goal probability for THIS shooter vs THIS keeper. */
  pGoal: number;
  /** P(on target | not scored) - splits non-goals into saves and misses. */
  pOnTargetIfNoGoal: number;
  distance: number;
}

export function shotModel(
  shooter: IFieldPlayer,
  keeper: IFieldPlayer | undefined,
  attackingSide: MatchSide,
  defendingSide: MatchSide,
  kind: ShotKind
): ShotModel {
  const c = getSimulationConfig().outcomes.shot;
  const goal = attackingSide.ScoringSide;
  const { distance, angle } = shotGeometry(shooter.BlockPosition, goal);
  const pressure = Math.min(2, getPressure(shooter, defendingSide, getSimulationConfig().pressing.tightRadius));

  let situation: number;
  let shooterWeights: SkillWeights;
  if (kind === 'penalty') {
    situation = logit(c.penaltyXg);
    shooterWeights = PENALTY_TAKER;
  } else if (kind === 'free-kick') {
    situation = logit(c.freeKickXg);
    shooterWeights = FREE_KICK_TAKER;
  } else {
    situation =
      c.intercept +
      c.angleCoeff * angle +
      c.distanceCoeff * distance +
      c.blockerLogit * shotBlockers(shooter, goal, defendingSide) +
      c.pressureLogit * pressure +
      (isClearThrough(shooter, goal, defendingSide) ? c.oneOnOneLogit : 0);
    // Finishing from close range is Shooting; from distance it's
    // LongShot/ShotPower.
    shooterWeights = blendWeights(SHOOTER_NEAR, SHOOTER_FAR, clamp((distance - 12) / 14, 0, 1));
  }

  const shooterSkill = skill(shooter, shooterWeights);
  const keeperSkill = keeper ? skill(keeper, KEEPER) : NO_KEEPER_SKILL;
  const pGoal = Math.min(
    c.maxGoalProbability,
    sigmoid(situation + (shooterSkill - c.skillPivot) / c.shooterScale - (keeperSkill - c.skillPivot) / c.keeperScale)
  );

  const pOnTargetIfNoGoal = clamp(
    c.onTarget.base +
      (shooterSkill - c.skillPivot) / c.onTarget.skillScale -
      c.onTarget.pressurePenalty * pressure -
      c.onTarget.distancePenaltyPerMetre * Math.max(0, distance - 11),
    0.05,
    0.8
  );

  return { xG: sigmoid(situation), pGoal, pOnTargetIfNoGoal, distance };
}

type PassKind = 'short' | 'backward' | 'wide' | 'long' | 'through';

const PASSER: Record<PassKind, SkillWeights> = {
  short: { ShortPass: 0.55, Vision: 0.15, Mental: 0.15, Control: 0.15 },
  backward: { ShortPass: 0.6, Mental: 0.2, Control: 0.2 },
  wide: { Crossing: 0.4, LongPass: 0.3, Vision: 0.2, Mental: 0.1 },
  long: { LongPass: 0.55, Vision: 0.25, Mental: 0.2 },
  through: { Vision: 0.45, LongPass: 0.35, Mental: 0.2 },
};
const RECEIVER: SkillWeights = { Control: 0.7, Agility: 0.15, Strength: 0.15 };
const INTERCEPTOR: SkillWeights = { Interception: 0.45, Positioning: 0.3, Mental: 0.15, Speed: 0.1 };

export interface PassModel {
  pComplete: number;
  laneBlockers: number;
}

export function passModel(
  passer: IFieldPlayer,
  receiver: IFieldPlayer,
  type: string,
  attackingSide: MatchSide,
  defendingSide: MatchSide,
  interceptor?: IFieldPlayer
): PassModel {
  const c = getSimulationConfig().outcomes.pass;
  const tight = getSimulationConfig().pressing.tightRadius;
  const kind = (type in PASSER ? type : 'short') as PassKind;
  const base = c.base[type as keyof typeof c.base] ?? c.base.default;

  const distance = metresBetween(passer.BlockPosition, receiver.BlockPosition);
  const laneBlockers = getPassingLane(passer.BlockPosition, receiver.BlockPosition, defendingSide).blockers.length;
  const passerPressure = Math.min(3, getPressure(passer, defendingSide, tight));
  const receiverPressure = Math.min(3, getPressure(receiver, defendingSide, tight));

  let l =
    logit(base) +
    c.distanceLogitPerMetre * Math.max(0, distance - c.comfortableMetres) +
    c.passerPressureLogit * passerPressure +
    c.receiverPressureLogit * receiverPressure +
    c.blockerLogit * Math.min(2, laneBlockers) +
    (skill(passer, PASSER[kind]) - getSimulationConfig().outcomes.shot.skillPivot) / c.passerScale +
    (skill(receiver, RECEIVER) - getSimulationConfig().outcomes.shot.skillPivot) / (c.passerScale * 2);

  if (interceptor) {
    l -= (skill(interceptor, INTERCEPTOR) - getSimulationConfig().outcomes.shot.skillPivot) / c.interceptorScale;
  }

  if (kind === 'through') {
    // Space in behind: a high line leaves room for the ball to land, a
    // deep block doesn't.
    l += c.throughBallLineLogit * (defendingSide.Tactic.style.defensiveLineHeight - 0.5);
  }

  return { pComplete: sigmoid(l), laneBlockers };
}

const TACKLER: SkillWeights = { Tackling: 0.45, Marking: 0.2, Strength: 0.15, Positioning: 0.1, Aggression: 0.1 };
const SHIELDER: SkillWeights = { Dribbling: 0.3, Control: 0.3, Strength: 0.2, Agility: 0.2 };
const DRIBBLER: SkillWeights = { Dribbling: 0.45, Agility: 0.25, Speed: 0.15, Control: 0.15 };
const DRIBBLE_DEFENDER: SkillWeights = { Tackling: 0.35, Marking: 0.3, Speed: 0.2, Positioning: 0.15 };

/** P(tackler wins the ball off the holder). */
export function tackleProbability(tackler: IFieldPlayer, holder: IFieldPlayer): number {
  const c = getSimulationConfig().outcomes.duel;
  return sigmoid(logit(c.tackleBase) + (skill(tackler, TACKLER) - skill(holder, SHIELDER)) / c.skillScale);
}

/** P(dribbler beats the defender). */
export function dribbleProbability(dribbler: IFieldPlayer, defender: IFieldPlayer): number {
  const c = getSimulationConfig().outcomes.duel;
  return sigmoid(logit(c.dribbleBase) + (skill(dribbler, DRIBBLER) - skill(defender, DRIBBLE_DEFENDER)) / c.skillScale);
}
