import { MatchSide } from '../classes/MatchSide';
import { TeamIntent } from './TeamIntent';

/**
 * Milestone 7 - computes a side's current TeamIntent from its Tactic's
 * playing style. `opponent` is accepted (matching the tracker's own
 * sketched `determineIntent(team, opponent, state)` signature) but
 * unused today - deliberately kept as a documented, intentional unused
 * seam rather than a signature that would need to grow again once a
 * later milestone (e.g. reacting to the opponent's shape/scoreline)
 * actually needs it.
 */
export function determineIntent(
  side: MatchSide,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  opponent: MatchSide
): TeamIntent {
  const style = side.Tactic.style;

  return {
    tempo: style.tempo,
    pressing: style.pressingIntensity,
    defensiveLine: style.defensiveLineHeight,
    positionalDiscipline: style.positionalDiscipline,
    width: style.width,
    directness: style.directness,
  };
}
