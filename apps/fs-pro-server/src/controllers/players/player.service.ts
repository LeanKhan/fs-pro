/* eslint-disable @typescript-eslint/no-unsafe-return */
import log from '../../helpers/logger';
import DB from '../../db';
import { PlayerInterface } from '../../interfaces/Player';
import { calculatePlayerValue } from '../../utils/players';
import { PlayerMatchDetailsInterface } from '../player-match/player-match.model';
import { Types } from 'mongoose';
import { PlayerRepositoryFactory } from '../../repositories/PlayerRepositoryFactory';
import { IPlayerFilter } from '../../repositories/PlayerRepository';
import { DrizzleDatabase } from '../../db/drizzle';
import { players, playerMatchDetails, fixtures, seasons } from '../../db/drizzle/schema';
import { eq, desc, inArray, sql as drizzleSql } from 'drizzle-orm';

/**
 * Repository-backed functions below are for the identity/CRUD surface that
 * has no arbitrary-query or Mongo-operator update in play - `update()` only
 * accepts plain fields. `updatePlayersDetails` (end-of-year progression),
 * `toggleSigned`, `updatePlayers` (bulk), and every aggregate-pipeline stats
 * function below stay on the raw functions, unchanged. See FUTURE-PLANS.md.
 */
let playerRepo: ReturnType<typeof PlayerRepositoryFactory.create> | null = null;

function getPlayerRepo() {
  if (!playerRepo) {
    playerRepo = PlayerRepositoryFactory.create();
  }
  return playerRepo;
}

export async function getPlayerById(id: string) {
  return getPlayerRepo().findById(id);
}

export async function getPlayers(filter?: IPlayerFilter) {
  return getPlayerRepo().findAll(filter);
}

export async function updatePlayerFields(id: string, data: Partial<PlayerInterface>) {
  return getPlayerRepo().update(id, data);
}

export async function deletePlayerById(id: string) {
  return getPlayerRepo().delete(id);
}

export async function createPlayer(data: Partial<PlayerInterface>) {
  data.Value = calculatePlayerValue(data.Position as string, data.Rating as number, data.Age as number);
  return getPlayerRepo().create(data);
}

/**
 * fetchAllPlayers
 *
 * fetch multiple Players based on query
 * default behaviour is to send all players in the db
 */
export function fetchAll(query: Record<string, unknown> = {}) {
  return DB.Models.Player.find(query).lean().exec();
}

export function updateById(id: string, update: any): Promise<PlayerInterface> {
  return DB.Models.Player.findByIdAndUpdate(id, update, { new: true })
    .lean()
    .exec();
}
/**
 * Toggle Signed
 *
 * Despite the name, this always sets `isSigned` to `!value` (not a real
 * toggle against current state) - callers pass the *current* isSigned
 * value and get the flipped one back, unchanged from the original
 * behavior. Repository-backed under `backend=drizzle` (a plain 3-field
 * write, no operators - `Club`/`ClubCode` are direct columns on `players`,
 * so this is the actual "add/remove player to/from club" write on
 * Postgres, not `Club.Players` which doesn't exist there).
 * @param playerId
 * @param value
 */
export function toggleSigned(
  playerId: string,
  value: boolean,
  clubCode: string | null,
  clubId: string | null
) {
  const fields = { isSigned: !value, ClubCode: clubCode, Club: clubId } as unknown as Partial<PlayerInterface>;

  if (DB.ormType === 'drizzle') {
    return updatePlayerFields(playerId, fields);
  }

  return DB.Models.Player.findByIdAndUpdate(playerId, {
    $set: fields,
  })
    .lean()
    .exec();
}

/**
 * Sign many Players to a Club in one write - the bulk equivalent of
 * `toggleSigned`, used by `PUT /clubs/:id/add-many-players`. Repository
 * `updateManyByIds` under `backend=drizzle` (plain fields, no operators);
 * unchanged raw `updateMany` on Mongo.
 */
export function signManyPlayersToClub(playerIds: string[], clubCode: string, clubId: string) {
  const fields = { isSigned: true, ClubCode: clubCode, Club: clubId } as unknown as Partial<PlayerInterface>;

  if (DB.ormType === 'drizzle') {
    return getPlayerRepo().updateManyByIds(playerIds, fields);
  }

  const pIds = playerIds.map((p) => new Types.ObjectId(p));
  return DB.Models.Player.updateMany({ _id: { $in: pIds } }, { $set: fields }, { multi: true });
}

export function updatePlayers(query: any, update: any) {
  return DB.Models.Player.updateMany(query, update, { multi: true });
}

/**
 * Increment every Player's Age by 1 - same treatment, and same reasoning,
 * as `manager.service.ts`'s `incrementAllManagersAge`: unconditional, fixed
 * `+1` for every row, so it's one SQL statement under `backend=drizzle`
 * instead of a per-row read-modify-write.
 */
export function incrementAllPlayersAge() {
  if (DB.ormType === 'drizzle') {
    const db = DrizzleDatabase.getInstance().database;
    return db.update(players).set({ Age: drizzleSql`${players.Age} + 1` });
  }

  return updatePlayers({}, { $inc: { Age: 1 } });
}

/** `id` -> `_id` remap applied to the batch-fetched Player/Fixture rows
 * `getPlayerStats`/`allPlayerStats` attach to each stats row below - same
 * reason every Drizzle repository in this codebase does this. */
function remapRowId<T extends { id: string; mongoId: string | null }>(row: T) {
  const { id, mongoId, ...rest } = row;
  return { _id: id, ...rest };
}

/**
 * Batches the Player (and, for `allPlayerStats`, Fixture) lookups the old
 * `$lookup`/`$unwind` stages did per-row, then merges them back onto the
 * grouped stats rows - one query each instead of N, same output shape
 * (`{ _id, goals, saves, ..., player, fixture?, count? }[]`) the Mongo
 * aggregate produced.
 */
async function attachPlayersAndFixtures(
  rows: {
    playerId: string;
    fixtureId?: string | null;
    goals: number | string;
    saves: number | string;
    passes: number | string;
    tackles: number | string;
    assists: number | string;
    clean_sheets: number | string;
    dribbles: number | string;
    points: number | string;
    form: number | string;
    count?: number | string;
  }[]
) {
  const db = DrizzleDatabase.getInstance().database;
  const playerIds = [...new Set(rows.map((r) => r.playerId))];
  const fixtureIds = [...new Set(rows.map((r) => r.fixtureId).filter((id): id is string => !!id))];

  const [playerRows, fixtureRows] = await Promise.all([
    playerIds.length
      ? db.query.players.findMany({ where: inArray(players.id, playerIds), with: { nationality: true } })
      : Promise.resolve([]),
    fixtureIds.length ? db.query.fixtures.findMany({ where: inArray(fixtures.id, fixtureIds) }) : Promise.resolve([]),
  ]);

  const playerMap = new Map(playerRows.map((p) => [p.id, remapRowId(p)]));
  const fixtureMap = new Map(fixtureRows.map((f) => [f.id, remapRowId(f)]));

  return rows.map((r) => ({
    _id: r.playerId,
    goals: Number(r.goals),
    saves: Number(r.saves),
    passes: Number(r.passes),
    tackles: Number(r.tackles),
    assists: Number(r.assists),
    clean_sheets: Number(r.clean_sheets),
    dribbles: Number(r.dribbles),
    points: Number(r.points),
    form: Number(r.form),
    player: playerMap.get(r.playerId),
    ...(r.fixtureId !== undefined ? { fixture: r.fixtureId ? fixtureMap.get(r.fixtureId) : undefined } : {}),
    ...(r.count !== undefined ? { count: Number(r.count) } : {}),
  }));
}

export async function getPlayerStats(calendar_id: string) {
  if (DB.ormType === 'drizzle') {
    const db = DrizzleDatabase.getInstance().database;
    const rows = await db
      .select({
        playerId: playerMatchDetails.Player,
        goals: drizzleSql<number>`sum(${playerMatchDetails.Goals})`,
        saves: drizzleSql<number>`sum(${playerMatchDetails.Saves})`,
        passes: drizzleSql<number>`sum(${playerMatchDetails.Passes})`,
        tackles: drizzleSql<number>`sum(${playerMatchDetails.Tackles})`,
        assists: drizzleSql<number>`sum(${playerMatchDetails.Assists})`,
        clean_sheets: drizzleSql<number>`sum(${playerMatchDetails.CleanSheets})`,
        dribbles: drizzleSql<number>`sum(${playerMatchDetails.Dribbles})`,
        points: drizzleSql<number>`avg(${playerMatchDetails.Points})`,
        form: drizzleSql<number>`avg(${playerMatchDetails.Form})`,
      })
      .from(playerMatchDetails)
      .innerJoin(fixtures, eq(playerMatchDetails.Fixture, fixtures.id))
      .innerJoin(seasons, eq(fixtures.Season, seasons.id))
      .where(eq(seasons.Calendar, calendar_id))
      .groupBy(playerMatchDetails.Player)
      .orderBy(desc(drizzleSql`avg(${playerMatchDetails.Points})`));

    return attachPlayersAndFixtures(rows.filter((r): r is typeof r & { playerId: string } => !!r.playerId));
  }

  return DB.Models.PlayerMatch.aggregate(
    [
      {
        $lookup: {
          from: 'Fixtures',
          localField: 'Fixture',
          foreignField: '_id',
          as: 'fixture',
        },
      },
      { $unwind: '$fixture' },
      {
        $lookup: {
          from: 'Seasons',
          localField: 'fixture.Season',
          foreignField: '_id',
          as: 'season',
        },
      },
      { $unwind: '$season' },
      { $match: { 'season.Calendar': new Types.ObjectId(calendar_id) } }, // Filter by the Year
      {
        $group: {
          _id: '$Player',
          goals: { $sum: '$Goals' },
          saves: { $sum: '$Saves' },
          passes: { $sum: '$Passes' },
          tackles: { $sum: '$Tackles' },
          assists: { $sum: '$Assists' },
          clean_sheets: { $sum: '$CleanSheets' },
          dribbles: { $sum: '$Dribbles' },
          points: { $avg: '$Points' },
          form: { $avg: '$Form' },
        },
      },
      {
        $lookup: {
          from: 'Players',
          localField: '_id',
          foreignField: '_id',
          as: 'player',
        },
      }, // Get the Player's details
      { $unwind: '$player' },
      { $sort: { points: -1 } },
    ],
    () => {
      log('Player Match Details Aggregate performed!');
    }
  );
}

export function getSpecificPlayerStats(matcher: any, sorter: any) {
  return DB.Models.PlayerMatch.aggregate(
    [
      {
        $lookup: {
          from: 'Fixtures',
          localField: 'Fixture',
          foreignField: '_id',
          as: 'fixture',
        },
      },
      { $unwind: '$fixture' },
      {
        $lookup: {
          from: 'Seasons',
          localField: 'fixture.Season',
          foreignField: '_id',
          as: 'season',
        },
      },
      { $unwind: '$season' },
      { $match: matcher }, // Filter by the Year
      {
        $group: {
          _id: '$Player',
          goals: { $sum: '$Goals' },
          saves: { $sum: '$Saves' },
          passes: { $sum: '$Passes' },
          tackles: { $sum: '$Tackles' },
          assists: { $sum: '$Assists' },
          clean_sheets: { $sum: '$CleanSheets' },
          dribbles: { $sum: '$Dribbles' },
          points: { $avg: '$Points' },
          form: { $avg: '$Form' },
        },
      },
      {
        $lookup: {
          from: 'Players',
          localField: '_id',
          foreignField: '_id',
          as: 'player',
        },
      }, // Get the Player's details
      { $unwind: '$player' },
      { $sort: sorter },
    ],
    () => {
      log('Player Match Details Aggregate performed!');
    }
  );
}

export async function allPlayerStats(
  season: string
): Promise<PlayerMatchDetailsInterface[]> {
  if (DB.ormType === 'drizzle') {
    const db = DrizzleDatabase.getInstance().database;
    const rows = await db
      .select({
        playerId: playerMatchDetails.Player,
        // Mongo's `$first` after `$unwind` picks an arbitrary member of
        // the group - min() here is just as arbitrary but deterministic.
        // Confirmed the only consumer (awards.controller.ts) never reads
        // any field off this fixture, so which one is picked doesn't
        // matter functionally.
        // min() has no built-in overload for uuid - cast to text for the
        // comparison (arbitrary either way, see comment above).
        fixtureId: drizzleSql<string>`min(${playerMatchDetails.Fixture}::text)`,
        goals: drizzleSql<number>`sum(${playerMatchDetails.Goals})`,
        saves: drizzleSql<number>`sum(${playerMatchDetails.Saves})`,
        passes: drizzleSql<number>`sum(${playerMatchDetails.Passes})`,
        tackles: drizzleSql<number>`sum(${playerMatchDetails.Tackles})`,
        assists: drizzleSql<number>`sum(${playerMatchDetails.Assists})`,
        clean_sheets: drizzleSql<number>`sum(${playerMatchDetails.CleanSheets})`,
        dribbles: drizzleSql<number>`sum(${playerMatchDetails.Dribbles})`,
        points: drizzleSql<number>`avg(${playerMatchDetails.Points})`,
        form: drizzleSql<number>`avg(${playerMatchDetails.Form})`,
        count: drizzleSql<number>`count(*)`,
      })
      .from(playerMatchDetails)
      .innerJoin(fixtures, eq(playerMatchDetails.Fixture, fixtures.id))
      .where(eq(fixtures.Season, season))
      .groupBy(playerMatchDetails.Player);

    return attachPlayersAndFixtures(
      rows.filter((r): r is typeof r & { playerId: string } => !!r.playerId)
    ) as unknown as Promise<PlayerMatchDetailsInterface[]>;
  }

  return DB.Models.PlayerMatch.aggregate(
    [
      {
        $lookup: {
          from: 'Fixtures',
          localField: 'Fixture',
          foreignField: '_id',
          as: 'fixture',
        },
      },
      { $unwind: '$fixture' },
      { $match: { 'fixture.Season': new Types.ObjectId(season) } },
       {
        $lookup: {
          from: 'Players',
          localField: 'Player',
          foreignField: '_id',
          as: 'player',
        },
      },
      { $unwind: '$player' },
    {
        $group: {
          _id: '$Player',
          goals: { $sum: '$Goals' },
          saves: { $sum: '$Saves' },
          passes: { $sum: '$Passes' },
          tackles: { $sum: '$Tackles' },
          assists: { $sum: '$Assists' },
          clean_sheets: { $sum: '$CleanSheets' },
          dribbles: { $sum: '$Dribbles' },
          points: { $avg: '$Points' },
          form: { $avg: '$Form' },
          player: { "$first": "$player" },
          fixture: { "$first": "$fixture" },
         count: { $sum: 1 }
        }
      },
    ],
    () => {
      log('Player Match Stats for entire Season gotten!');
    }
  );
}

/**
 *
 * [
      {
        $lookup: {
          from: 'Fixtures',
          localField: 'Fixture',
          foreignField: '_id',
          as: 'fixture',
        },
      },
      { $unwind: '$fixture' },
      { $match: { 'fixture.Season': ObjectId("60f23609a730eb4838371762") } },
       {
        $lookup: {
          from: 'Players',
          localField: 'Player',
          foreignField: '_id',
          as: 'player',
        },
      },
      { $unwind: '$player' },
          {
        $group: {
          _id: '$Player',
          goals: { $sum: '$Goals' },
          saves: { $sum: '$Saves' },
          passes: { $sum: '$Passes' },
          tackles: { $sum: '$Tackles' },
          assists: { $sum: '$Assists' },
          clean_sheets: { $sum: '$CleanSheets' },
          dribbles: { $sum: '$Dribbles' },
          points: { $avg: '$Points' },
          form: { $avg: '$Form' },
          player: { "$first": "$player" },
          fixture: { "$first": "$fixture" },
         count: { $sum: 1 }
        }
      },

      { $sort: {'points': -1} }
    ]
 * */


/**
 * Create Many Players
 */
export function createMany(playerObjects: any[]) {
  if (DB.ormType === 'drizzle') {
    if (!playerObjects.length) return Promise.resolve([]);
    const db = DrizzleDatabase.getInstance().database;
    return db
      .insert(players)
      .values(playerObjects.map((p) => ({ ...p, updatedAt: new Date() })))
      .returning();
  }

  return DB.Models.Player.insertMany(playerObjects, { ordered: true });
}