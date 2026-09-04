import {
  getPlayerStats,
  getPlayerById,
  getPlayers,
  updatePlayerFields,
  incrementAllPlayersAge,
  createMany,
} from './player.service';
import { incrementAllManagersAge } from '../managers/manager.service';
import {
  newAttributeRatings,
  generatePlayer,
  MATCH_GROWTH_SCALE,
} from '../../utils/players';
import { applyTrainingGrowth } from './player-training.service';
import { PlayerInterface, IPlayerAttributes } from '../../interfaces/Player';
import { runSpawn } from '../../utils/scripts';
import { titleCase } from '../../helpers/misc';

/** Recompute every active signed Player's Attributes/Rating/Value for
 * `year` (appending to RatingsHistory), then age everyone up. Plain
 * function (not an Express handler) so it can be called directly from a
 * ts-rest handler - see calendar.router.ts's endSeasonCycle.
 *
 * Two additive growth sources feed the same Attributes object before one
 * write: training (applyTrainingGrowth - universal, every signed player,
 * every year, free) always runs first as the base layer, then match-based
 * growth (newAttributeRatings, scaled by MATCH_GROWTH_SCALE) layers on top
 * for whoever actually has match stats for `year`. Order between the two
 * doesn't affect the final Rating - both only ever read Rating/Age at
 * entry and mutate Attributes, and calculatePlayerRating over the summed
 * Attributes is commutative. This is why the loop now iterates every
 * active signed Player (getPlayers), not just getPlayerStats(year)'s
 * match-stats aggregation as before - a player who never took the pitch
 * still gets their club's training. */
export async function updateAllPlayerDetailsForYear(year: string) {
  const updPlayer = async (data: {
    player_id: string;
    attributes: IPlayerAttributes;
    new_rating: number;
    new_value: number;
    old_rating: number;
    old_value: number;
    trainingCategory: string;
    breakout: boolean;
  }) => {
    const player = await getPlayerById(data.player_id);
    const ratingsHistory = [
      ...(player?.RatingsHistory ?? []),
      {
        date: new Date().toString(),
        year,
        rating: data.new_rating,
        value: data.new_value,
        old_rating: data.old_rating,
        old_value: data.old_value,
        trainingCategory: data.trainingCategory,
        breakout: data.breakout,
      },
    ];

    return updatePlayerFields(data.player_id, {
      Attributes: data.attributes,
      Rating: data.new_rating,
      Value: data.new_value,
      RatingsHistory: ratingsHistory,
    });
  };

  const [agg, activePlayers] = await Promise.all([
    getPlayerStats(year),
    getPlayers({ isSigned: true }),
  ]);
  console.log('agg', agg.length, 'activePlayers', activePlayers.length);

  const matchPointsByPlayerId = new Map(
    agg
      .filter((p): p is typeof p & { player: { _id: string } } => !!p.player)
      .map((p) => [p.player._id, p.points])
  );

  const toDo: any[] = [];
  activePlayers.forEach((p) => {
    const player = p as unknown as PlayerInterface;
    const old_rating = player.Rating;
    const old_value = player.Value;

    const training = applyTrainingGrowth(player);
    let new_rating = training.new_rating;
    let new_value = training.new_value;

    const matchPoints = matchPointsByPlayerId.get(p._id as string);
    if (matchPoints !== undefined) {
      const match = newAttributeRatings(player, matchPoints * MATCH_GROWTH_SCALE);
      new_rating = match.new_rating;
      new_value = match.new_value;
    }

    toDo.push({
      attributes: player.Attributes,
      new_rating,
      new_value,
      old_rating,
      old_value,
      trainingCategory: training.category,
      breakout: training.breakout,
      player_id: p._id,
    });
  });

  // TODO: Mehn, I don't know how we will do this! Sha for now let's do all PromiseAll
  // Promise.all() has a 2 million limit lol. So we have to do this in batches o
  const updates = await Promise.all(toDo.map((d) => updPlayer(d)));

  await Promise.all([incrementAllPlayersAge(), incrementAllManagersAge()]);

  console.log('Finished updating players! => ', updates.length);
}

/** Generate `number` random Players via the `player_names` child-process
 * script (name generation for the given `culture`), then persist them all
 * at `position`. Plain function (not an Express handler) so it can be
 * called directly from the ts-rest handler in player.router.ts. */
export async function generateAndSavePlayers(
  number: string,
  culture: string,
  position: string
) {
  const playerNames = (await runSpawn('player_names', [
    'generate',
    number,
    'f_l',
    culture,
  ])) as string;

  const names = playerNames
    .split('\r\n')
    .filter((x) => x || null)
    .map((n) => n.split('__').map((l) => titleCase(l)));

  const generatedPlayers = names.map((p) =>
    generatePlayer({
      position,
      firstname: p[0],
      lastname: p[1],
      nationality: culture,
    })
  );

  return createMany(generatedPlayers);
}
