import { IFieldPlayer } from '../../interfaces/Player';
import { ICoordinate } from '../state/ImmutableState/FieldGrid';
import { MatchSide } from '../classes/MatchSide';
import CO from '../utils/coordinates';

/**
 * Milestone 10 (Spatial Analysis Services) - pass-lane geometry moved out
 * of `Decider.ts`'s private `laneIsClear()`. Same perpendicular-distance-
 * to-segment formula, verbatim, just relocated and generalized to take
 * plain coordinates (`from`/`to`) instead of two `IFieldPlayer`s, since
 * nothing in the formula actually needs the player objects themselves -
 * this is what lets a future caller (Milestone 13's passing-option
 * scoring) ask about a candidate lane between any two points, not only
 * between two players already on the pitch.
 */
export interface PassingLane {
  clear: boolean;
  /** Opponents (excluding GK) standing inside `laneWidth` of the a->b
   * segment - empty when `clear` is true. Not consumed by any caller yet;
   * kept for Milestone 13's benefit (scoring a pass by *which* defenders
   * threaten it, not just whether it's blocked). */
  blockers: IFieldPlayer[];
}

/**
 * Is the straight line between `from` and `to` free of defenders?
 * Uses actual lane geometry (perpendicular distance to the pass line)
 * rather than just proximity to the receiver.
 */
export function getPassingLane(
  from: ICoordinate,
  to: ICoordinate,
  defendingSide: MatchSide,
  laneWidth = 1.5
): PassingLane {
  const blockers = defendingSide.ActivePlayers.filter((opponent) => {
    return (
      opponent.Position !== 'GK' &&
      CO.co.distanceToSegment(opponent.BlockPosition, from, to) <= laneWidth
    );
  });

  return { clear: blockers.length === 0, blockers };
}
