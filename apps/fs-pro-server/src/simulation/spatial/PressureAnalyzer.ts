import { IFieldPlayer } from '../../interfaces/Player';
import { MatchSide } from '../classes/MatchSide';
import CO from '../utils/coordinates';

/**
 * Milestone 10 (Spatial Analysis Services) - the pressure-counting formula
 * `Decider.ts`'s private `countPressure()` used to own now lives in exactly
 * one place. Before this pass, `ObservationBuilder.buildObservation()`
 * separately re-derived an equivalent "opponents within radius" filter
 * inline (documented at the time as deliberate near-term duplication,
 * flagged for this exact milestone) - both now call the same function
 * below, so decision-making (Decider) and observation-building
 * (ObservationBuilder) can never quietly drift into two different answers
 * for "how much pressure is this player under".
 */

/**
 * Opposing non-GK outfield players within `radius` blocks (scaled to
 * whatever grid resolution is in play) of `player`. Verbatim formula from
 * the original `Decider.countPressure()` - just relocated.
 */
export function getPressuringOpponents(
  player: IFieldPlayer,
  defendingSide: MatchSide,
  radius: number
): IFieldPlayer[] {
  const scaledRadius = CO.co.scaleDistance(radius);

  return defendingSide.ActivePlayers.filter((opponent) => {
    return (
      opponent.Position !== 'GK' &&
      CO.co.calculateDistance(player.BlockPosition, opponent.BlockPosition) <=
        scaledRadius
    );
  });
}

/** How many opposing outfield players are pressuring this player. */
export function getPressure(
  player: IFieldPlayer,
  defendingSide: MatchSide,
  radius: number
): number {
  return getPressuringOpponents(player, defendingSide, radius).length;
}
