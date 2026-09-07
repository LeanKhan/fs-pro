import { IFieldPlayer } from '../../interfaces/Player';
import { ICoordinate } from '../state/ImmutableState/FieldGrid';
import { MatchSide } from '../classes/MatchSide';
import CO from '../utils/coordinates';

/**
 * Milestone 10 (Spatial Analysis Services) - new spatial helpers beyond
 * the pressure/lane geometry that already existed in `Decider.ts` (see
 * `PressureAnalyzer.ts`/`PassingAnalyzer.ts`). None of these have a live
 * caller yet - same "infrastructure for a future caller" shape as
 * Milestone 6's transition validation: nearest-player/goal-distance are
 * consumed by `ObservationBuilder` starting this pass, but goal angle,
 * open space, space ahead, defensive line, and compactness are deliberately
 * NOT wired into any decision yet. Feeding them into `TeamIntent`/
 * `PlayerPolicy` is explicitly later milestones' job (11's phases, 12's
 * formation shape, 13's passing-option scoring) - inventing a caller here
 * would be scope creep, exactly the same call Milestone 7 made for
 * `mentality`/`focus`/`risk`/`phase`.
 */

function sortByDistance(
  origin: ICoordinate,
  players: IFieldPlayer[]
): IFieldPlayer[] {
  return [...players].sort(
    (a, b) =>
      CO.co.calculateDistance(origin, a.BlockPosition) -
      CO.co.calculateDistance(origin, b.BlockPosition)
  );
}

/** The `count` closest teammates to `player`, nearest first. Same
 * "several closest, not just nearest" selection `Decider.passability()`
 * and `ObservationBuilder.buildObservation()` each used to compute
 * separately - now one shared formula. */
export function getNearestTeammates(
  player: IFieldPlayer,
  teammates: IFieldPlayer[],
  count = 3
): IFieldPlayer[] {
  return sortByDistance(
    player.BlockPosition,
    teammates.filter((p) => p !== player)
  ).slice(0, count);
}

/** The single closest opponent to `player`, or undefined if `opponents` is
 * empty. */
export function getNearestOpponent(
  player: IFieldPlayer,
  opponents: IFieldPlayer[]
): IFieldPlayer | undefined {
  return sortByDistance(player.BlockPosition, opponents)[0];
}

/** Distance from a position to a goal post (own or opponent's). */
export function getGoalDistance(position: ICoordinate, post: ICoordinate): number {
  return CO.co.calculateDistance(position, post);
}

/**
 * Shot angle in degrees off the direct strike line to `post`, since the
 * goal is modelled as a single point (see FieldGrid/MatchSide). 0 means
 * `position` is level with the post along the attacking axis - the
 * straightest possible sight of goal; 90 means `position` is out level
 * with the goal line itself, the widest, hardest angle. Distance-
 * independent by design - a tight angle far out and a tight angle close in
 * are both "0", exactly as a real shot angle would read.
 */
export function getGoalAngle(position: ICoordinate, post: ICoordinate): number {
  const dx = Math.abs(post.x - position.x);
  const dy = Math.abs(post.y - position.y);

  if (dx === 0 && dy === 0) {
    return 0;
  }

  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** Distance from `player` to the nearest of `opponents` - larger means more
 * room to work with. Infinity when `opponents` is empty. */
export function getOpenSpace(
  player: IFieldPlayer,
  opponents: IFieldPlayer[]
): number {
  const nearest = getNearestOpponent(player, opponents);

  return nearest
    ? CO.co.calculateDistance(player.BlockPosition, nearest.BlockPosition)
    : Infinity;
}

/**
 * How contested is the direct corridor from `player` towards his own
 * scoring post, up to `distance` blocks ahead? Counts non-GK opponents
 * standing within `laneWidth` of that corridor - fewer is more open space
 * to advance into. Distinct from `getPassingLane` (which judges a specific
 * pass between two named points): this always aims at goal and is capped
 * to a short lookahead rather than the full pass distance.
 */
export function getSpaceAhead(
  player: IFieldPlayer,
  attackingSide: MatchSide,
  defendingSide: MatchSide,
  distance: number,
  laneWidth = 2
): number {
  const scaledDistance = CO.co.scaleDistance(distance);
  const totalDistance = CO.co.calculateDistance(
    player.BlockPosition,
    attackingSide.ScoringSide
  );

  if (totalDistance === 0) {
    return 0;
  }

  const t = Math.min(1, scaledDistance / totalDistance);
  const ahead: ICoordinate = {
    x:
      player.BlockPosition.x +
      (attackingSide.ScoringSide.x - player.BlockPosition.x) * t,
    y:
      player.BlockPosition.y +
      (attackingSide.ScoringSide.y - player.BlockPosition.y) * t,
  };

  return defendingSide.ActivePlayers.filter((opponent) => {
    return (
      opponent.Position !== 'GK' &&
      CO.co.distanceToSegment(
        opponent.BlockPosition,
        player.BlockPosition,
        ahead
      ) <= laneWidth
    );
  }).length;
}

/**
 * Average distance of `team`'s outfield defenders from their own goal
 * (`KeepingSide`) - falls back to all non-GK outfielders if the side has
 * no players in the DEF slot. Higher means a higher defensive line (pushed
 * further from goal); lower means a deeper/low block. Measured relative to
 * `KeepingSide` rather than a raw x-coordinate so it stays correct
 * regardless of which way the team is currently attacking.
 */
export function getDefensiveLine(team: MatchSide): number {
  const defenders = team.ActivePlayers.filter((p) => p.Position === 'DEF');
  const pool = defenders.length
    ? defenders
    : team.ActivePlayers.filter((p) => p.Position !== 'GK');

  if (!pool.length) {
    return 0;
  }

  const total = pool.reduce(
    (sum, p) =>
      sum + CO.co.calculateDistance(p.BlockPosition, team.KeepingSide),
    0
  );

  return total / pool.length;
}

/**
 * Average pairwise distance between `team`'s active outfield players
 * (GK excluded - the keeper's position doesn't reflect outfield shape).
 * Lower means a more compact team shape; higher means more spread out.
 */
export function getTeamCompactness(team: MatchSide): number {
  const players = team.ActivePlayers.filter((p) => p.Position !== 'GK');

  if (players.length < 2) {
    return 0;
  }

  let totalDistance = 0;
  let pairs = 0;

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      totalDistance += CO.co.calculateDistance(
        players[i].BlockPosition,
        players[j].BlockPosition
      );
      pairs++;
    }
  }

  return totalDistance / pairs;
}
