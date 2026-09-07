import { MatchSide } from '../classes/MatchSide';
import { TeamIntent } from './TeamIntent';
import {
  getAttackingPhase,
  getDefendingPhase,
  PhaseContext,
} from '../possession/MatchPhase';

/** Milestone 11 - the possession context this tick needs to compute
 * `phase`: whether `side` is the one currently holding the ball, plus the
 * shared possession-sequence facts (`PhaseContext`) both `getAttackingPhase`/
 * `getDefendingPhase` read. */
export type IntentContext = PhaseContext & { hasBall: boolean };

/**
 * Milestone 7 - computes a side's current TeamIntent from its Tactic's
 * playing style. `opponent` was originally accepted-but-unused (documented
 * at the time as "no real signal yet to need it for") - Milestone 11 is
 * the real caller: `phase` genuinely depends on the opponent's own
 * position/shape (counter-attack and press-vs-shape both read the
 * opponent's state, not just `side`'s own).
 */
export function determineIntent(
  side: MatchSide,
  opponent: MatchSide,
  possession: IntentContext
): TeamIntent {
  const style = side.Tactic.style;
  const phase = possession.hasBall
    ? getAttackingPhase(side, opponent, possession)
    : getDefendingPhase(side, opponent, possession);

  return {
    tempo: style.tempo,
    pressing: style.pressingIntensity,
    defensiveLine: style.defensiveLineHeight,
    positionalDiscipline: style.positionalDiscipline,
    width: style.width,
    directness: style.directness,
    phase,
  };
}
