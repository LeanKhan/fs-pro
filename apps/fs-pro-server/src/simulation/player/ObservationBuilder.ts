import { IFieldPlayer } from '../../interfaces/Player';
import { MatchSide } from '../classes/MatchSide';
import CO from '../utils/coordinates';
import { PlayerObservation, VisiblePlayer } from './PlayerObservation';

/** Same default pressure radius `Decider.confidenceThreshold()` already
 * uses when it calls `countPressure(player, defendingSide, 3)`. */
const PRESSURE_RADIUS = 3;

/**
 * Milestone 7 - builds a PlayerObservation from the same primitives
 * (`CO.co.calculateDistance`/`scaleDistance`) `Decider.ts` already calls
 * directly, rather than reusing Decider's own private methods (kept
 * private on purpose - a one-pass wrapper isn't reason enough to expose
 * them). This is a deliberate, documented near-term duplication:
 * `Decider`'s internals still recompute their own equivalent values
 * rather than consuming this observation - see the simulation-engine-
 * isolation plan's note on why (Milestone 10's Spatial Analyzer is where
 * both get a single shared source to pull from instead).
 */
export function buildObservation(
  player: IFieldPlayer,
  attackingSide: MatchSide,
  defendingSide: MatchSide
): PlayerObservation {
  const scaledPressureRadius = CO.co.scaleDistance(PRESSURE_RADIUS);

  const opponents: VisiblePlayer[] = defendingSide.ActivePlayers.filter(
    (opponent) => opponent.Position !== 'GK'
  )
    .map((opponent) => ({
      playerId: opponent._id,
      position: opponent.Position,
      distance: CO.co.calculateDistance(
        player.BlockPosition,
        opponent.BlockPosition
      ),
    }))
    .filter((opponent) => opponent.distance <= scaledPressureRadius);

  const teammates: VisiblePlayer[] = attackingSide.ActivePlayers.filter(
    (teammate) => teammate !== player
  )
    .map((teammate) => ({
      playerId: teammate._id,
      position: teammate.Position,
      distance: CO.co.calculateDistance(
        player.BlockPosition,
        teammate.BlockPosition
      ),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);

  return {
    self: {
      position: { x: player.BlockPosition.x, y: player.BlockPosition.y },
      withBall: player.WithBall,
    },
    pressure: opponents.length,
    goalDistance: CO.co.calculateDistance(
      player.BlockPosition,
      attackingSide.ScoringSide
    ),
    teammates,
    opponents,
  };
}
