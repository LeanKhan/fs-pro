/* eslint-disable no-prototype-builtins */
import { MatchSide } from '../classes/MatchSide';
import { IBlock } from '../state/ImmutableState/FieldGrid';
import { ratingFactors, postitionFactors, ageFactors } from './player-factors';
import {
  shuffleArray,
  randomBetween,
  pickRandomFromArray,
} from '../helpers/misc';
import {
  IPositions,
  IFieldPlayer,
  PlayerInterface,
  IPlayerAttributes,
  Multipliers,
  AllMultipliers,
} from '../interfaces/Player';
import { Role, Roles } from '../controllers/players/player.model';

/**
 * Get attackers and midfielders that are not with the ball
 *
 * @param team
 */
function getATTMID(team: MatchSide) {
  return team.ActivePlayers.filter((player) => {
    if (
      (player.Position === 'ATT' && !player.WithBall) ||
      (player.Position === 'MID' && !player.WithBall)
    ) {
      return true;
    } else {
      return false;
    }
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

  const randomIndex = Math.round(Math.random() * (circumference.length - 1));

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

  const randomIndex = Math.round(Math.random() * (farthestBlocks.length - 1));

  return farthestBlocks[randomIndex];
}

/**
 * Get a random Attacker or Midfielder - No filter
 *
 */
function getRandomATTMID(team: MatchSide): IFieldPlayer {
  const list = getATTMIDNoFilter(team);

  const randomIndex = Math.round(Math.random() * (list.length - 1));

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

// function findClosestPlayerToPost(team: MatchSide, scoringSide: IBlock){
//     const noneKeepers = team.StartingSquad.filter(player => {
//         if (
//           (player.Position !== 'GK') ||
//           (!player.WithBall)
//         ) {
//           return true;
//         } else {
//           return false;
//         }
//       });

//       const distances = noneKeepers.forEach((p)=>{
//         co.calculateDistance()
//       });
// }

/** Yearly-progression tuning constant, not intrinsic to newAttributeRatings
 * itself (which stays reusable elsewhere) - multiplies the match-performance
 * points fed into it once per player per year. Calibrated via direct
 * simulation (apps/fs-pro-server/tmp_calibrate.ts): great year, 17yo
 * prospect -> ~+5 mean/+8 max Rating; mediocre year -> ~+3; veteran (30),
 * good year -> ~+1.7. Growth was previously negligible (a great year moved
 * Rating well under +1) because calculatePlayerRating is a weighted SUM
 * across small per-attribute role weights - most 0.0-0.3, only Keeping
 * (GK, 0.44) and Tackling (CDM, 0.42) break that pattern - so raw
 * attribute-point gains get diluted into fractional Rating moves. */
export const MATCH_GROWTH_SCALE = 8;

function calculatePlayerValue(pos: string, rating: number, age: number) {
  // 1. Get basevalue from overall...
  // 2. get position multiplier...
  // 3. get potential multiplier...
  // 4. get age multiplier...

  const basevalue = getBasevalue(Math.round(rating));

  const position_multiplier = basevalue * getPositionMultiplier(pos);

  const age_number = typeof age == 'string' ? parseInt(age) : age;

  const age_multiplier = basevalue * getAgeMultiplier(pos, age_number);

  return Math.round(basevalue + position_multiplier + age_multiplier);
}

/** A player's annual Wage, deducted from their Club's Budget once per game
 * Year (see transfers/transfer.service.ts's deductWagesForYear) - a flat
 * ratio of Value, not a considered balance pass. Placeholder default,
 * tune WAGE_RATIO if the numbers feel off in practice. */
export const WAGE_RATIO = 0.15;

function calculatePlayerWage(value: number): number {
  return Math.round(value * WAGE_RATIO);
}

function getBasevalue(rating: number): number {
  return ratingFactors[rating];
}

function calculateTotal(
  multiplier: Multipliers,
  attributes: IPlayerAttributes
) {
  // attributes.reduce((a: IPlayerAttributes) => {

  // }, 0)

  const attr = Object.keys(attributes);

  // attr.filter(a => typeof multiplier[c] != 'number' )

  const total = attr.reduce((sum, c, ci, arr) => {
    // console.log(`Type: ${typeof multiplier[c] != 'number'}`);
    // console.log(
    //   `Result: ${attributes[c]} x ${multiplier[c]} = ${
    //     attributes[c] * multiplier[c]
    //   }`
    // );
    if (typeof multiplier[c] != 'number') {
      return sum;
    }
    // attributes and multipliers must have the same keys :)
    return sum + attributes[c] * multiplier[c];
  }, 0);

  if (total > 99) return 99;

  return total;
}

/**
 Calculate Player Rating
*/
export function calculatePlayerRating(
  attributes: IPlayerAttributes,
  position: string,
  role: Role
) {
  let multiplier: Multipliers;
  let rating = 0;

  // is this completely redundant?? - investigate  :p
  switch (position) {
    case 'ATT':
      rating = calculateTotal(AllMultipliers[role], attributes);
      break;
    case 'MID':
      rating = calculateTotal(AllMultipliers[role], attributes);
      break;
    case 'DEF':
      rating = calculateTotal(AllMultipliers[role], attributes);
      break;
    case 'GK':
      rating = calculateTotal(AllMultipliers[role], attributes);
      break;
    default:
      // this means the player is neither!
      rating = -10000;
      break;
  }

  return rating;
}

function getPositionMultiplier(pos: string): number {
  let position = -1;
  switch (pos) {
    case 'GK':
      position = 0;
      break;
    case 'DEF':
      position = 1 + Math.round(Math.random() * 10);
      break;
    case 'MID':
      position = randomBetween(12, 20);
      break;
    case 'ATT':
      position = randomBetween(20, 26);
      break;
    default:
      break;
  }

  return postitionFactors[position] / 100;
}

function getAgeMultiplier(pos: string, age: number): number {
  let multiplier = 0;
  if (pos === 'GK') {
    multiplier = -2;
  } else {
    // adding 1 to account for zero indexing
    multiplier = ageFactors[age + 1];
  }

  return multiplier / 100;
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

const attributes = [
  'Speed',
  'Shooting',
  'LongPass',
  'ShortPass',
  'Mental',
  'Tackling',
  'Keeping',
  'Control',
  'Strength',
  'Stamina',
  'SetPiece',
  'Dribbling',
  'Vision',
  'ShotPower',
  'Aggression',
  'Interception',
];

// TODO: look into adding the new attributes
// to here...
const attributesToIncrease: {
  ATT: string[];
  GK: string[];
  MID: string[];
  DEF: string[];
  [key: string]: string[];
} = {
  ATT: [
    'Speed',
    'Shooting',
    'LongPass',
    'ShortPass',
    'Mental',
    'Control',
    'SetPiece',
    'Dribbling',
    // new
    'LongShot',
    'Positioning',
    'Agility',
    'Aggression',
    'Vision',
    'Crossing',
  ],
  GK: [
    'LongPass',
    'ShortPass',
    'Control',
    'Keeping',
    //  new
    'Positioning',
    'Agility',
  ],
  MID: [
    'Speed',
    'Shooting',
    'Mental',
    'LongPass',
    'ShortPass',
    'Control',
    'Tackling',
    'Strength',
    'Stamina',
    'Dribbling',
    // new
    'LongShot',
    'Marking',
    'Crossing',
    'Agility',
    'Vision',
  ],
  DEF: [
    'Speed',
    'Shooting',
    'Mental',
    'LongPass',
    'ShortPass',
    'Control',
    'Tackling',
    'Strength',
    'Stamina',
    // new
    'Marking',
    'Crossing',
    'LongShot',
    'Interception',
    'Aggression',
  ],
};

/** Shared rating-based dampening (95/88/80 thresholds) used by both
 * match-based growth (newAttributeRatings) and training-based growth
 * (player-training.service.ts) - extracted so the two systems can't
 * silently drift on these thresholds. */
export function ratingDampeningMultiplier(rating: number): number {
  if (rating >= 95) return 0.4;
  if (rating >= 88) return 0.5;
  if (rating >= 80) return 0.9;
  return 1;
}

/** Attribute values are on a 0-99 scale (calculateTotal/calculatePlayerRating
 * already cap the derived Rating at 99) - individual attributes were never
 * actually clamped by the original distribution loop, a pre-existing gap
 * that stayed harmless while the only caller (newAttributeRatings) spread
 * modest points over a large (14-21 attribute) pool. Training's much
 * smaller category pools (4-6 attributes, see player-training.service.ts)
 * expose it for real - clamped here since both callers share this helper. */
export const MAX_ATTRIBUTE_VALUE = 99;

/** Distributes `points` across `pool` (each hit capped at +5, clamped at
 * MAX_ATTRIBUTE_VALUE), cycling through the pool as many times as needed
 * rather than shuffling once and dumping whatever's left onto the last
 * remaining attribute. That dump-onto-last-attribute behavior (this
 * function's original design) was harmless for match-based growth's large
 * (14-21 attribute) pools - it rarely triggered there - but training's
 * narrow category pools (2-6 attributes) hit it constantly, and it was the
 * root cause of two real problems confirmed via multi-year simulation: (1)
 * breakout years getting "caught up to" by normal years within a few
 * seasons, because a single big dump pushed 1-2 attributes to the 99 cap
 * early, wasting every later year's points on an already-maxed attribute
 * while a non-breakout peer's same attributes still had headroom; (2) GK's
 * disproportionate variance, because a big dump landing on Keeping (0.44
 * weight, the single highest in the whole multiplier system) produced huge
 * single-year spikes. Match-based growth's narrowest case (GK's 6-attribute
 * attributesToIncrease.GK pool) had the same failure mode at a smaller
 * scale, so this fix applies to both callers - see
 * training_system_feature.md in memory for the full investigation. Mutates
 * `attributes` in place; no-op if points/pool are empty. */
export function distributeAttributePoints(
  attributes: IPlayerAttributes,
  pool: string[],
  points: number
): void {
  if (points <= 0 || pool.length === 0) return;

  let remaining = Math.round(points);
  let guard = remaining * 4 + 20; // generous bound, well above worst-case iteration count

  while (remaining > 0 && guard-- > 0) {
    if (pool.every((a) => attributes[a] >= MAX_ATTRIBUTE_VALUE)) break;

    const attr = pool[Math.floor(Math.random() * pool.length)];
    if (attributes[attr] >= MAX_ATTRIBUTE_VALUE) continue;

    const toBeAdded = Math.max(1, Math.round(Math.random() * Math.min(remaining, 5)));
    attributes[attr] = Math.min(MAX_ATTRIBUTE_VALUE, attributes[attr] + toBeAdded);
    remaining -= toBeAdded;
  }
}

/** A pool often contains attributes that carry ZERO weight for a given
 * Role's real AllMultipliers table (e.g. GK's attributesToIncrease pool
 * has ShortPass/Control at 0 weight for GK - only 4 of its 6 attributes are
 * "live"). Points spent on a dead attribute don't move Rating at all, but
 * DO still push it toward the 99 cap for nothing - filtering to live-only
 * avoids that waste and lets poolSizeScale below see how narrow a role's
 * real trainable pool actually is. Falls back to the full pool if nothing
 * in it carries any weight (a genuinely all-dead pool - rare, but distributing
 * across something is still better than a no-op). */
export function liveAttributePool(role: Role, pool: string[]): string[] {
  const weights = AllMultipliers[role];
  const live = pool.filter((a) => (weights?.[a] ?? 0) > 0);
  return live.length > 0 ? live : pool;
}

/** A role whose live pool is narrower than this saturates its few live
 * attributes far faster than a role at/above it for the same points budget
 * (confirmed via multi-year simulation - GK's 2-live-attribute Technical
 * training pool and CDM's 1-live-attribute Defending pool both hit 100%
 * saturation with zero breakout/non-breakout separation within a decade,
 * while a 5-live pool like CM's Technical kept a real, lasting gap). Points
 * are scaled by liveCount/this reference, clamped, so narrow-pool
 * role/category combinations get proportionally less pushed into their few
 * live attributes instead of oversaturating them. */
const REFERENCE_LIVE_POOL_SIZE = 4;
const MIN_POOL_SCALE = 0.25;
const MAX_POOL_SCALE = 1.5;

export function poolSizeScale(liveCount: number): number {
  const raw = liveCount / REFERENCE_LIVE_POOL_SIZE;
  return Math.min(MAX_POOL_SCALE, Math.max(MIN_POOL_SCALE, raw));
}

/** Match growth's own pool-size guard - deliberately NOT poolSizeScale
 * above (that one was calibrated for training's narrow 2-6 attribute
 * category pools and, tried here too, badly over-corrected: filtering to
 * live-only plus its up-to-1.5x boost inflated match growth's already-
 * calibrated scale=8 numbers by 2-3x for every role, not just GK, wiping
 * out the whole training/match balance - see training_system_feature.md in
 * memory). attributesToIncrease's position pools are exactly 14 attributes
 * for ATT/DEF/MID and only 6 for GK - GK is the sole outlier a match-growth
 * guard needs to handle, so this only ever REDUCES points for a pool
 * smaller than the 14-attribute reference, never boosts one at or above
 * it - outfield roles get scale 1.0 (byte-identical to the confirmed
 * scale=8 calibration), GK gets 6/14 (~0.43). No live-weight filtering
 * either, for the same reason: match growth's original calibration already
 * baked in some "wasted" points landing on zero-weight attributes, and
 * removing that changes the numbers it was tuned against. */
const REFERENCE_POSITION_POOL_SIZE = 14;

export function positionPoolScale(poolSize: number): number {
  return Math.min(1, poolSize / REFERENCE_POSITION_POOL_SIZE);
}

//  TODO: TEST THIS! 30-08-21
export function newAttributeRatings(player: PlayerInterface, pnts: number) {
  /**
   * - Get attributes that would be increased...
   * - Share points among attributes
   */
  let points = Math.round(pnts);

  points *= ratingDampeningMultiplier(player.Rating);

  // if player is above a certain age then. his points shouldn't increase that much...
  if (player.Age > 32) {
    // he is no more developing quickly...
    points *= 0.4; // only use 80% of their points...
  } else if (player.Age > 28) {
    // he is no more developing quickly...
    points *= 0.5; // only use 80% of their points...
  } else if (player.Age >= 20 && player.Age <= 22) {
    // add some extra points to rating lol...
    points += 3;
  } else if (player.Age < 20) {
    // add some extra points to rating lol...
    points += 5;
  }

  points *= positionPoolScale(attributesToIncrease[player.Position].length);

  distributeAttributePoints(
    player.Attributes,
    attributesToIncrease[player.Position],
    points
  );

  const new_rating = Math.round(
    calculatePlayerRating(player.Attributes, player.Position, player.Role)
  );

  const new_value = calculatePlayerValue(
    player.Position,
    new_rating,
    player.Age
  );

  // TODO: Age should be factored in distributing points...

  return { attributes: player.Attributes, new_rating, new_value };
}

function generatePlayer({
  position,
  firstname,
  lastname,
  nationality,
  ageRange = [18, 30],
  attributeRange = [20, 60],
  positionAttributeRange,
}: {
  position: string;
  firstname: string;
  lastname: string;
  nationality: string;
  /** Passed straight to randomBetween - default [18,30] reproduces the
   * original generic-generation behavior unchanged. Youth intake
   * (player-lifecycle.service.ts) passes a distinctly younger range. */
  ageRange?: [number, number];
  attributeRange?: [number, number];
  /** Position-specific attributes (attributesToIncrease[position]) -
   * default (undefined) keeps the original flat-64 boost; pass a range for
   * a randomized-but-still-elevated value instead (a flat 64 would be
   * inconsistent on a low-attributeRange youth prospect). */
  positionAttributeRange?: [number, number];
}) {
  const obj = {
    FirstName: firstname,
    LastName: lastname,
    NationalityId: '', // set
    Age: 0, // random
    Position: position,
    Rating: 0,
    Role: '', // random
    Attributes: {
      PreferredFoot: '', // random
      Speed: randomBetween(...attributeRange),
      Shooting: randomBetween(...attributeRange),
      LongPass: randomBetween(...attributeRange),
      ShortPass: randomBetween(...attributeRange),
      Mental: randomBetween(...attributeRange),
      Control: randomBetween(...attributeRange),
      Tackling: randomBetween(...attributeRange),
      Dribbling: randomBetween(...attributeRange),
      SetPiece: randomBetween(...attributeRange),
      Strength: randomBetween(...attributeRange),
      Stamina: randomBetween(...attributeRange),
      Vision: randomBetween(...attributeRange),
      ShotPower: randomBetween(...attributeRange),
      Aggression: randomBetween(...attributeRange),
      Interception: randomBetween(...attributeRange),
      Keeping: randomBetween(...attributeRange),
      Marking: randomBetween(...attributeRange),
      Agility: randomBetween(...attributeRange),
      Positioning: randomBetween(...attributeRange),
      Crossing: randomBetween(...attributeRange),
      LongShot: randomBetween(...attributeRange),
      AttackingMindset: false, // random
      DefensiveMindset: false, // random
    },
    isSigned: false,
    Value: 0,
    Wage: 0,
  };

  // set nationality
  switch (nationality) {
    case 'kev':
      obj.NationalityId = 'f526f31c-53e6-4eac-8b07-9591deea5a6e';
      break;
    case 'bellean':
      obj.NationalityId = 'b4f41821-c586-4b67-8dfc-521c51cd00e0';
      break;
    default:
      // default bellean :)
      obj.NationalityId = 'b4f41821-c586-4b67-8dfc-521c51cd00e0';
  }

  // set Age
  obj.Age = randomBetween(...ageRange);

  // set Position
  obj.Role = pickRandomFromArray(Roles[obj.Position as keyof typeof Roles]);

  // set Preferred Foot
  obj.Attributes.PreferredFoot = pickRandomFromArray(['left', 'right']);

  // set AttackingMindset DefensiveMindset
  obj.Attributes.AttackingMindset = pickRandomFromArray([true, false]);
  obj.Attributes.DefensiveMindset = pickRandomFromArray([true, false]);

  // set Position specific attributes
  attributesToIncrease[
    obj.Position as keyof typeof attributesToIncrease
  ].forEach((attr) => {
    (obj.Attributes as any)[attr] = positionAttributeRange
      ? randomBetween(...positionAttributeRange)
      : 64;
  });

  console.log('Generated Player payload => ', obj);

  // set Rating
  obj.Rating = calculatePlayerRating(
    obj.Attributes,
    obj.Position,
    obj.Role as Role
  );

  // set Value
  // you need Player's Rating to calculate their Value
  obj.Value = calculatePlayerValue(obj.Position, obj.Rating, obj.Age);

  // set Wage - was previously never set at all (a pre-existing gap on this
  // already-broken generation path), harmless to fix incidentally here.
  obj.Wage = calculatePlayerWage(obj.Value);

  return obj;
}

export {
  getATTMID,
  findFreeBlock,
  findRandomFreeBlock,
  findFarthestFreeBlock,
  getRandomATTMID,
  getGK,
  calculatePlayerValue,
  calculatePlayerWage,
  sortFromKeeperDown,
  generatePlayer,
  attributesToIncrease,
};
