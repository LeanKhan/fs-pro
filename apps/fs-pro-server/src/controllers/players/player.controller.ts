import {
  getPlayerStats,
  incrementAllPlayersAge,
  createMany,
  type DayRange,
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
import { nationalityIdForCulture } from '../../services/nationality';
import { getAssetEffectsForClubs } from '../../services/facilities/facilities.service';
import { eq, sql } from 'drizzle-orm';
import { players } from '../../db/drizzle/schema';
import { DrizzleDatabase } from '../../db/drizzle';

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
export async function updateAllPlayerDetailsForYear(year: string, range: DayRange) {
  type Update = {
    player_id: string;
    attributes: IPlayerAttributes;
    new_rating: number;
    new_value: number;
    old_rating: number;
    old_value: number;
    trainingCategory: string;
    breakout: boolean;
  };
  /** One UPDATE ... FROM (VALUES ...) per batch: a world's worth of players
   * (hundreds of thousands at 10k clubs) in a few hundred statements, with
   * the year's history line appended in the database. */
  const updateBatch = async (batch: Update[]) => {
    if (!batch.length) return;
    const rows = batch.map(
      (d) =>
        sql`(${d.player_id}::uuid, ${JSON.stringify(d.attributes)}::jsonb, ${d.new_rating}::real, ${d.new_value}::real, ${JSON.stringify([
          {
            date: new Date().toString(),
            year,
            rating: d.new_rating,
            value: d.new_value,
            old_rating: d.old_rating,
            old_value: d.old_value,
            trainingCategory: d.trainingCategory,
            breakout: d.breakout,
          },
        ])}::jsonb)`
    );
    await DrizzleDatabase.getInstance().database.execute(sql`
      UPDATE "Players" p
      SET "Attributes" = v.a, "Rating" = v.r, "Value" = v.val,
          "RatingsHistory" = coalesce(p."RatingsHistory", '[]'::jsonb) || v.h, "updatedAt" = now()
      FROM (VALUES ${sql.join(rows, sql`, `)}) AS v(id, a, r, val, h)
      WHERE p."_id" = v.id`);
  };

  const [agg, activePlayers] = await Promise.all([
    getPlayerStats(range),
    // A plain select, not the repository: its relational read binds a
    // parameter per row and fails past ~65k players (a 10k-club world has
    // 160k).
    DrizzleDatabase.getInstance()
      .database.select()
      .from(players)
      .where(eq(players.isSigned, true))
      .then((rows) => rows.map(({ id, ...p }) => ({ ...p, _id: id }))),
  ]);
  console.log('agg', agg.length, 'activePlayers', activePlayers.length);

  const matchPointsByPlayerId = new Map(
    agg
      .filter((p): p is typeof p & { player: { _id: string } } => !!p.player)
      .map((p) => [p.player._id, p.points])
  );

  // Training Ground's growth bonus is per-club - every club's multiplier in
  // one bulk read up front, rather than a query per club or per player.
  const distinctClubIds = [
    ...new Set(activePlayers.map((p) => (p as unknown as PlayerInterface).ClubId).filter(Boolean)),
  ] as string[];
  const effects = await getAssetEffectsForClubs(distinctClubIds);
  const trainingMultiplierByClub = new Map(
    distinctClubIds.map((id) => [id, effects.get(id)?.trainingGrowthMultiplier ?? 1] as const)
  );

  const toDo: any[] = [];
  activePlayers.forEach((p) => {
    const player = p as unknown as PlayerInterface;
    const old_rating = player.Rating;
    const old_value = player.Value;

    const growthMultiplier = player.ClubId ? trainingMultiplierByClub.get(player.ClubId) ?? 1 : 1;
    const training = applyTrainingGrowth(player, growthMultiplier);
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

  const BATCH = 500;
  for (let i = 0; i < toDo.length; i += BATCH) await updateBatch(toDo.slice(i, i + BATCH));
  const updates = { length: toDo.length };

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

  const nationalityId = await nationalityIdForCulture(culture);
  const generatedPlayers = names.map((p) =>
    generatePlayer({
      position,
      firstname: p[0],
      lastname: p[1],
      nationality: culture,
      nationalityId,
    })
  );

  return createMany(generatedPlayers);
}
