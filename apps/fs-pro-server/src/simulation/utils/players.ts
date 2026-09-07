/* eslint-disable no-prototype-builtins */
/**
 * Match-tick-only player/block lookup helpers - split out of the server's
 * `utils/players.ts` (which also holds CRUD/training-layer rating/growth
 * functions used by player.service.ts/player.controller.ts/
 * player-training.service.ts/etc, never called during live simulation).
 * Verified line-by-line that the two function sets are completely
 * disjoint before splitting - see the simulation-engine-isolation plan
 * for the full split rationale.
 */
import { MatchSide } from '../classes/MatchSide';
import { IBlock } from '../state/ImmutableState/FieldGrid';
import {
  IPositions,
  IFieldPlayer,
  PlayerInterface,
} from '../../interfaces/Player';
import { simulationRandomInt } from '../randomness';

/**
 * Every outfield player (DEF/MID/ATT - GK excluded, same as everywhere
 * else in this file) not currently on the ball. Milestone 12 (Formation
 * Anchors And Team Shape) - replaces the old `getATTMID(team)` at every
 * shape-holding call site (`Actions.pushForward`/`pushBackward`/
 * `pressureBall`, and the Milestone 11 hold-shape branch in
 * `continueGamePlay`): those previously only ever moved ATT/MID players,
 * leaving every defender frozen in their kickoff block for the entire
 * match outside of a tackle/duel they happened to be personally involved
 * in. Renamed rather than just widening `getATTMID`'s own filter, since
 * "attackers and midfielders" is no longer an accurate name for what it
 * selects.
 *
 * @param team
 */
function getOutfield(team: MatchSide) {
  return team.ActivePlayers.filter((player) => {
    return player.Position !== 'GK' && !player.WithBall;
  });
}

/**
 * Get Attackers and Midfielders even if they are with the ball
 * @param team
 */
function getATTMIDNoFilter(team: MatchSide) {
  return team.ActivePlayers.filter((player) => {
    if (player.Position === 'ATT' || player.Position === 'MID') {
      return true;
    } else {
      return false;
    }
  });
}

/**
 * Find a random free block in a 3 block radius
 * @param player
 */
function findRandomFreeBlock(player: IFieldPlayer, radius: number = 3): IBlock {
  // Get blocks around player
  let circumference = player.getBlocksAround(radius);

  // Filter the undefined or occupied ones
  circumference = circumference.filter((block: IBlock) => {
    if (block === undefined || block.occupant !== null) {
      return false;
    } else {
      return true;
    }
  });

  // Then return a random one...

  const randomIndex = simulationRandomInt(circumference.length);

  return circumference[randomIndex];
}

/**
 * Like findRandomFreeBlock, but biased toward the farthest free blocks
 * instead of picking uniformly at random among all of them.
 *
 * Used when a player needs to actually put distance between themselves and
 * a marker (escaping a tight-marking duel) - a uniform-random pick is just
 * as likely to land one block away as five, which barely counts as an
 * escape and lets an equally fast marker re-close the gap almost
 * immediately.
 */
function findFarthestFreeBlock(
  player: IFieldPlayer,
  radius: number = 5
): IBlock {
  const circumference = (player.getBlocksAround(radius) as IBlock[]).filter(
    (block) => {
      return block !== undefined && block.occupant === null;
    }
  );

  if (circumference.length === 0) {
    return player.BlockPosition;
  }

  const distanceFromPlayer = (block: IBlock) =>
    Math.abs(block.x - player.BlockPosition.x) +
    Math.abs(block.y - player.BlockPosition.y);

  const maxDistance = Math.max(...circumference.map(distanceFromPlayer));
  const farthestBlocks = circumference.filter(
    (block) => distanceFromPlayer(block) === maxDistance
  );

  const randomIndex = simulationRandomInt(farthestBlocks.length);

  return farthestBlocks[randomIndex];
}

/**
 * Get a random Attacker or Midfielder - No filter
 *
 */
function getRandomATTMID(team: MatchSide): IFieldPlayer {
  const list = getATTMIDNoFilter(team);

  const randomIndex = simulationRandomInt(list.length);

  return list[randomIndex];
}

/**
 * Get the goalkeeper from the given list of players
 */
function getGK(squad: IFieldPlayer[]) {
  return squad.find((player) => {
    // tslint:disable-next-line: triple-equals
    return player.Position === 'GK';
  });
}

function getRandomDEF(team: MatchSide) {
  return team.StartingSquad.find((player) => {
    return player.Position === 'ATT' || player.Position === 'MID';
  });
}

/**
 *
 * Find a free block around
 *
 * Bounds are checked against the block's own Field.mapWidth/mapHeight
 * (with a proper AND) instead of the old `||` chain hardcoded to 11/6,
 * which was almost always true regardless of position and only matched
 * the old 15x11 grid anyway. In practice `around` entries already come
 * pre-filtered by checkNextBlocks(), so this is a defensive re-check.
 *
 * @param around
 */
function findFreeBlock(around: IPositions) {
  for (const key in around) {
    if (around.hasOwnProperty(key) && around[key] !== undefined) {
      const block = around[key] as IBlock;
      const inBounds =
        block.x >= 0 &&
        block.y >= 0 &&
        block.x <= block.Field.mapWidth - 1 &&
        block.y <= block.Field.mapHeight - 1;

      if (inBounds) {
        if (block.occupant == null) {
          return block;
        }
      } else {
        return undefined;
      }
    }
  }
}

/**
Sort from keeper down
-Returns the players from GK-DEF-MID-ATT

**/
function sortFromKeeperDown(players: PlayerInterface[]) {
  const positions = { GK: 4, DEF: 3, MID: 2, ATT: 1 } as {
    GK: number;
    DEF: number;
    MID: number;
    ATT: number;
    [key: string]: number;
  };

  return players.sort((a, b) => positions[b.Position] - positions[a.Position]);
}

export {
  getOutfield,
  getATTMIDNoFilter,
  findRandomFreeBlock,
  findFarthestFreeBlock,
  getRandomATTMID,
  getGK,
  getRandomDEF,
  findFreeBlock,
  sortFromKeeperDown,
};
