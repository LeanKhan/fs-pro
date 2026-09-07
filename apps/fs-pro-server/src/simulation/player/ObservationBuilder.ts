import { IFieldPlayer } from '../../interfaces/Player';
import { MatchSide } from '../classes/MatchSide';
import { getPressuringOpponents } from '../spatial/PressureAnalyzer';
import { getGoalDistance, getNearestTeammates } from '../spatial/SpatialAnalyzer';
import CO from '../utils/coordinates';
import { PlayerObservation, VisiblePlayer } from './PlayerObservation';

/** Same default pressure radius `Decider.confidenceThreshold()` already
 * uses when it calls `countPressure(player, defendingSide, 3)`. */
const PRESSURE_RADIUS = 3;

/**
 * Milestone 7 - builds a PlayerObservation from the same primitives
 * `Decider.ts` already calls directly. Originally a documented, deliberate
 * near-term duplication (Decider's internals recomputed their own
 * equivalent pressure/nearest-teammate values rather than consuming this
 * observation). Milestone 10 (Spatial Analysis Services) resolved that:
 * pressure and nearest-teammate selection now both pull from
 * `spatial/PressureAnalyzer.ts`/`spatial/SpatialAnalyzer.ts`, the single
 * shared source the Milestone 7 note said this would eventually need -
 * `Decider.countPressure()`/`passability()` call the exact same functions.
 */
export function buildObservation(
  player: IFieldPlayer,
  attackingSide: MatchSide,
  defendingSide: MatchSide
): PlayerObservation {
  const opponents: VisiblePlayer[] = getPressuringOpponents(
    player,
    defendingSide,
    PRESSURE_RADIUS
  ).map((opponent) => ({
    playerId: opponent._id,
    position: opponent.Position,
    distance: CO.co.calculateDistance(
      player.BlockPosition,
      opponent.BlockPosition
    ),
  }));

  const teammates: VisiblePlayer[] = getNearestTeammates(
    player,
    attackingSide.ActivePlayers,
    3
  ).map((teammate) => ({
    playerId: teammate._id,
    position: teammate.Position,
    distance: CO.co.calculateDistance(
      player.BlockPosition,
      teammate.BlockPosition
    ),
  }));

  return {
    self: {
      position: { x: player.BlockPosition.x, y: player.BlockPosition.y },
      withBall: player.WithBall,
    },
    pressure: opponents.length,
    goalDistance: getGoalDistance(player.BlockPosition, attackingSide.ScoringSide),
    teammates,
    opponents,
  };
}
