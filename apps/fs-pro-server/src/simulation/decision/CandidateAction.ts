/**
 * Milestone 18 (Score-Based Decisions) - the six action shapes the tracker
 * names for the ball carrier's decision, one level ABOVE execution.
 * `PlayerIntent`/`IStrategy` (player/PlayerIntent.ts,
 * state/ImmutableState/Actions/Decider.ts) still only carry three
 * execution kinds ('pass'/'shoot'/'move') - `Actions.move()` already
 * decides for itself, at execution time, whether a 'move' plays out as an
 * uncontested carry or a contested dribble (whether a marking opponent
 * happens to be adjacent when the move actually resolves - see
 * `Actions.ts`'s dribble-contest block, unchanged by this milestone). So
 * 'carry'/'dribble'/'hold'/'support' below are genuinely distinct
 * DECISIONS (why the player chose to keep the ball, and what they're
 * trying to do with it) that collapse to the same 'move' execution intent
 * today - not four execution branches the engine can actually make play
 * out differently on the pitch. Documented here rather than inventing
 * four new execution paths with no real behavioral difference between
 * them (the same "revise scope, document why" treatment prior milestones
 * gave field-grid resolution and multi-tick ball flight).
 */
export type CandidateActionType =
  | 'shoot'
  | 'pass'
  | 'carry'
  | 'dribble'
  | 'hold'
  | 'support';

/**
 * One scored candidate action, as sketched in the plan doc's Phase 21
 * ("Record decisions, not just events"). `score` is a 0-1 expected
 * utility, deliberately on the SAME rough scale across every type (see
 * each `Decider.scoreX()` method for how it gets there) so `chooseCandidate`
 * below can weigh six differently-shaped actions against each other
 * directly, without a second normalization pass.
 */
export interface CandidateAction {
  type: CandidateActionType;
  /** 'normal'/'long' for shoot; a `PassType` (or the legacy 'pass to
   * post' special case) for pass; undefined for the four move-shaped
   * types - execution doesn't distinguish them (see the module doc
   * comment above), so there's nothing further to record here. */
  detail?: string;
  /** The chosen receiver - 'pass' candidates only. */
  targetId?: string;
  score: number;
}

/**
 * Choose among scored candidates with ONE draw against `roll` (the
 * caller's seeded RNG), weighting each by a softmax: weight = e^(score/T).
 *
 * `temperature` is how much the chooser deviates from the best option: a
 * low T almost always takes the top-scored action, a high T spreads
 * choices across anything competitive. The Decider derives it from the
 * player's decision-making (Mental/Vision), so a composed playmaker picks
 * the right pass far more reliably than a rash one - decision quality is
 * a real attribute, not flavour text.
 *
 * Replaces Milestone 18's score-squared draw: squaring sharpened a flat
 * linear draw, but with six or seven candidates in play it still handed
 * most of the probability to whichever options were NOT the best (measured
 * with scripts/agencyCheck.ts: carriers dribbled or held ~60% of the time
 * and passed ~22%, and a team's tactical instructions could not move that
 * mix). A softmax gives a score gap the same meaning however many
 * candidates there are.
 */
export function chooseCandidate(
  candidates: CandidateAction[],
  roll: number,
  temperature: number
): CandidateAction {
  const top = Math.max(...candidates.map((c) => c.score));
  // Subtract the top score before exponentiating - same result, no overflow.
  const weights = candidates.map((c) => Math.exp((c.score - top) / temperature));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let remaining = roll * total;

  for (let i = 0; i < candidates.length; i++) {
    remaining -= weights[i];
    if (remaining <= 0) {
      return candidates[i];
    }
  }

  return candidates[candidates.length - 1];
}
