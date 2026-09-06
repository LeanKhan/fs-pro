/**
 * Milestone 7 (Team Intent And Player Policy) - see the
 * simulation-engine-isolation plan for the full scoping rationale.
 *
 * Honestly, this is today's `IPlayingStyle` (state/PersistentState/
 * Formations.ts) renamed/exposed as a first-class thing decisions can be
 * computed from - not yet computed FROM anything dynamic itself. The
 * plan doc's own sketch also has `mentality`/`focus`/`risk`/`phase`
 * fields - deliberately not included here, since there's no real signal
 * anywhere in the engine yet to compute them from (that needs Milestone
 * 11's possession/phase tracking or Milestone 18's score-based
 * decisions). Inventing placeholder enum values for them now would be
 * exactly the premature-abstraction pattern this project avoids
 * elsewhere - add them when a real computation exists, not before.
 */
export interface TeamIntent {
  /** 0 = patient, 1 = fast-paced. */
  tempo: number;
  /** How many of the nearest outfield players actively close down the
   * ball carrier. */
  pressing: number;
  /** 0 = deep/low block, 1 = high defensive line. */
  defensiveLine: number;
  /** 0 = drifts freely toward the ball, 1 = strictly holds formation slot. */
  positionalDiscipline: number;
  /** 0 = narrow, 1 = stretches play across the full pitch width. Not
   * consumed by any decision/movement logic yet - exposed for later
   * milestones. */
  width: number;
  /** 0 = short-passing bias, 1 = direct/long-passing bias. Not consumed
   * by any decision/movement logic yet - exposed for later milestones. */
  directness: number;
}
