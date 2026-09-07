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

/** A zero-score candidate still gets a small floor weight rather than
 * becoming literally unreachable - matches this milestone's own
 * "probabilistically... not pure randomness" framing: even a bad option is
 * possible, just rare, never impossible. */
const MIN_WEIGHT = 0.02;

/**
 * Milestone 18's "choose probabilistically from scored actions rather than
 * always picking the top score" - a single weighted draw against `roll`
 * (the caller's own RNG draw, so this stays reproducible under a seeded
 * match exactly like every other roll in the engine; see
 * `Decider.makeDecision()`'s `this.random.next()` call). A higher-scored
 * candidate is more likely to be chosen, not guaranteed to be.
 *
 * Weights are the score SQUARED, not the raw score - a flat linear weight
 * (tried first, verified against `simRealismCheck.ts`) spreads probability
 * mass almost evenly across every candidate whenever their scores land in
 * the same rough neighborhood (which they usually do - see the individual
 * scoreX() methods), which under-selects the genuinely best option far
 * more than the old sequential-threshold chain ever did (that always
 * locked in the FIRST check to pass, with no competition at all). Squaring
 * concentrates the draw toward the better-scored candidates while keeping
 * every option reachable (never zero, thanks to `MIN_WEIGHT`) - measured
 * live via `simRealismCheck.ts --compare` against the pre-Milestone-18
 * baseline, not asserted from theory alone.
 */
export function chooseCandidate(
  candidates: CandidateAction[],
  roll: number
): CandidateAction {
  const weights = candidates.map((c) => Math.max(c.score, MIN_WEIGHT) ** 2);
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
