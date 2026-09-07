import { MatchSide } from '../classes/MatchSide';
import { ICoordinate } from '../state/ImmutableState/FieldGrid';
import { getGoalDistance, getDefensiveLine } from '../spatial/SpatialAnalyzer';
import { PossessionReason } from './PossessionTracker';

/**
 * Milestone 11 (Possession And Match Phases) - the ten phases the tracker
 * doc names. `restart`/`attacking-transition`/`defensive-transition`/
 * `counter` are keyed off how the current possession sequence began (see
 * `PossessionTracker`); `build-up`/`progression`/`final-third` off where
 * the ball actually is on the pitch (reusing Milestone 10's
 * `getGoalDistance`); `press`/`defensive-shape` off what the opponent is
 * doing right now. `chance` is deliberately NOT returned by either
 * function below - it's assigned retroactively, only to shot/save/miss/
 * goal events (see `Match.ts`'s `-event` listener), since "this was a
 * scoring chance" is only knowable after the decision that created it,
 * not before.
 */
export type MatchPhase =
  | 'restart'
  | 'build-up'
  | 'progression'
  | 'final-third'
  | 'chance'
  | 'attacking-transition'
  | 'defensive-transition'
  | 'defensive-shape'
  | 'press'
  | 'counter';

export interface PhaseContext {
  reason: PossessionReason;
  minutesSinceStart: number;
  /** Where the ball actually is right now - needed to tell build-up from
   * progression from final-third. */
  ballPosition: ICoordinate;
}

/** How long a restart or a turnover still counts as a "transition" before
 * settling into an ordinary possession phase. Minute-granularity (see
 * `PossessionContext.minutesSinceStart`), so this is deliberately short -
 * restarts and transitions resolve within a tick or two of real play. */
const TRANSITION_WINDOW_MINUTES = 1;

/** A defensive line further than this fraction of the pitch from their own
 * goal counts as "pushed high enough to be vulnerable" for `counter`. */
const COUNTER_LINE_FRACTION = 0.5;

/** How far `ballPosition` is from `side`'s own goal, as a fraction of the
 * full pitch length (0 = at the opponent's goal line, 1 = at `side`'s
 * own). */
function fieldFraction(side: MatchSide, ballPosition: ICoordinate): number {
  const pitchLength = getGoalDistance(side.KeepingSide, side.ScoringSide);

  if (pitchLength === 0) {
    return 1;
  }

  return getGoalDistance(ballPosition, side.ScoringSide) / pitchLength;
}

/** Is `defendingSide`'s back line pushed high enough to be worth breaking
 * at speed, right after winning the ball back? Reuses Milestone 10's
 * `getDefensiveLine` (average defender distance from their own goal). */
function isCounterOpportunity(defendingSide: MatchSide): boolean {
  const pitchLength = getGoalDistance(
    defendingSide.KeepingSide,
    defendingSide.ScoringSide
  );

  if (pitchLength === 0) {
    return false;
  }

  return getDefensiveLine(defendingSide) / pitchLength > COUNTER_LINE_FRACTION;
}

/** What is `side` (currently in possession) doing right now? */
export function getAttackingPhase(
  side: MatchSide,
  opponent: MatchSide,
  context: PhaseContext
): MatchPhase {
  if (
    context.reason === 'restart' &&
    context.minutesSinceStart < TRANSITION_WINDOW_MINUTES
  ) {
    return 'restart';
  }

  if (
    context.reason === 'turnover' &&
    context.minutesSinceStart < TRANSITION_WINDOW_MINUTES
  ) {
    return isCounterOpportunity(opponent)
      ? 'counter'
      : 'attacking-transition';
  }

  const fraction = fieldFraction(side, context.ballPosition);

  if (fraction <= 1 / 3) return 'final-third';
  if (fraction <= 2 / 3) return 'progression';
  return 'build-up';
}

/** What is `side` (currently NOT in possession) doing right now? */
export function getDefendingPhase(
  side: MatchSide,
  opponent: MatchSide,
  context: PhaseContext
): MatchPhase {
  if (
    context.reason === 'restart' &&
    context.minutesSinceStart < TRANSITION_WINDOW_MINUTES
  ) {
    return 'restart';
  }

  if (
    context.reason === 'turnover' &&
    context.minutesSinceStart < TRANSITION_WINDOW_MINUTES
  ) {
    return 'defensive-transition';
  }

  // Press while the ball's still in a winnable area; once the opponent
  // reaches their final third, everyone's already goal-side and compact
  // anyway - chasing the ball there risks being played through instead.
  const opponentPhase = getAttackingPhase(opponent, side, context);

  return opponentPhase === 'build-up' || opponentPhase === 'progression'
    ? 'press'
    : 'defensive-shape';
}
