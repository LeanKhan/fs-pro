import {
  getPlayerStats,
  getPlayerById,
  updatePlayerFields,
  incrementAllPlayersAge,
  createMany,
} from './player.service';
import { incrementAllManagersAge } from '../managers/manager.service';
import { newAttributeRatings, generatePlayer } from '../../utils/players';
import { PlayerInterface, IPlayerAttributes } from '../../interfaces/Player';
import { runSpawn } from '../../utils/scripts';
import { titleCase } from '../../helpers/misc';

/** Recompute every Player's Attributes/Rating/Value from their stats for
 * `year` (appending to RatingsHistory), then age everyone up. Plain
 * function (not an Express handler) so it can be called directly from a
 * ts-rest handler - see calendar.router.ts's endSeasonCycle. */
export async function updateAllPlayerDetailsForYear(year: string) {
  const updPlayer = async (data: {
    player_id: string;
    attributes: IPlayerAttributes;
    new_rating: number;
    new_value: number;
    old_rating: number;
    old_value: number;
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
      },
    ];

    return updatePlayerFields(data.player_id, {
      Attributes: data.attributes,
      Rating: data.new_rating,
      Value: data.new_value,
      RatingsHistory: ratingsHistory,
    });
  };

  const agg = await getPlayerStats(year);
  console.log('agg', agg.length);

  const toDo: any[] = [];
  agg.forEach((p) => {
    if (!p.player) return;
    const player = p.player as unknown as PlayerInterface;
    const { attributes, new_rating, new_value } = newAttributeRatings(
      player,
      p.points
    );
    toDo.push({
      attributes,
      new_rating,
      new_value,
      old_rating: player.Rating,
      old_value: player.Value,
      player_id: p.player._id,
    });
  });

  // TODO: Mehn, I don't know how we will do this! Sha for now let's do all PromiseAll
  // Promise.all() has a 2 million limit lol. So we have to do this in batches o
  const updates = await Promise.all(toDo.map((d) => updPlayer(d)));

  await Promise.all([incrementAllPlayersAge(), incrementAllManagersAge()]);

  console.log('Finished updating players! => ', updates);
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
