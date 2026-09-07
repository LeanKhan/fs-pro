import { CandidateAction } from '../decision/CandidateAction';

/**
 * Milestone 20 (Fatigue, Confidence, And Player Memory) - the plan doc's
 * own `PlayerMemory` sketch (Phase 25), field names unchanged except
 * `lastAction`: the plan sketches it as the older `PlayerIntent` type
 * (`player/PlayerIntent.ts`), but that type is produced by converting a
 * `Decider`-chosen `CandidateAction` (Milestone 18) - recording the
 * richer `CandidateAction` directly (score included) is strictly more
 * information for the same cost, and avoids `Decider.ts` importing back
 * from `PlayerIntent.ts`, which already imports `Decider.ts` for
 * `IStrategy` (a real circular-import risk, not a style preference).
 *
 * "Don't build full cognitive agents. Small state is enough" (the plan
 * doc's own words) - this stays a handful of small counters/pointers, not
 * a history log.
 */
export interface IPlayerMemory {
  /** Consecutive failed dribble attempts - reset to 0 on a success, not
   * decayed over time (see `recordDribbleOutcome`). */
  recentFailedDribbles: number;
  recentShots: number;
  /** The last opponent this player beat with a successful dribble -
   * single most-recent, not a list (the plan doc's own sketch: "the
   * fullback", singular). */
  opponentBeatenRecently?: string;
  /** Up to the last 3 distinct opponents who've pressed this player
   * tightly - a small rolling window, not unbounded. */
  recentlyPressedBy?: string[];
  lastAction?: CandidateAction;
}

const RECENTLY_PRESSED_BY_LIMIT = 3;

export function createInitialMemory(): IPlayerMemory {
  return { recentFailedDribbles: 0, recentShots: 0 };
}

/** "player attempts three unsuccessful dribbles -> confidence falls ->
 * slightly more likely to pass" (the plan doc's own example) -
 * `recentFailedDribbles` is what `Decider.scoreDribble()` actually reads
 * to make that concrete. A success clears the streak AND remembers who
 * was beaten ("winger repeatedly beats the same fullback -> more
 * willingness to attack him", the plan's other example). */
export function recordDribbleOutcome(
  memory: IPlayerMemory,
  success: boolean,
  opponentId?: string
): void {
  if (success) {
    memory.recentFailedDribbles = 0;
    if (opponentId) {
      memory.opponentBeatenRecently = opponentId;
    }
  } else {
    memory.recentFailedDribbles = Math.min(5, memory.recentFailedDribbles + 1);
  }
}

export function recordShotAttempt(memory: IPlayerMemory): void {
  memory.recentShots += 1;
}

/** Populated whenever `Decider.scoreDribble()` looks up the player's
 * current tight marker (see that method's own doc comment) - a light,
 * incidental population rather than a dedicated pressing-detection pass,
 * since the plan doc names this field but doesn't sketch a concrete
 * consumption mechanic for it beyond `opponentBeatenRecently`'s own
 * (separate) example. */
export function recordPressure(memory: IPlayerMemory, opponentId: string): void {
  const list = memory.recentlyPressedBy ?? [];
  if (!list.includes(opponentId)) {
    list.push(opponentId);
    if (list.length > RECENTLY_PRESSED_BY_LIMIT) {
      list.shift();
    }
  }
  memory.recentlyPressedBy = list;
}

export function recordAction(memory: IPlayerMemory, action: CandidateAction): void {
  memory.lastAction = action;
}
