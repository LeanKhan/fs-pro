/* eslint-disable @typescript-eslint/no-unsafe-return */
import { PlayerInterface } from '../../interfaces/Player';
import { calculatePlayerValue } from '../../utils/players';
import { PlayerMatchDetailsInterface } from '../player-match/player-match.model';
import { PlayerRepositoryFactory } from '../../repositories/PlayerRepositoryFactory';
import { IPlayerFilter } from '../../repositories/PlayerRepository';
import { DrizzleDatabase } from '../../db/drizzle';
import {
  players,
  playerMatchDetails,
  fixtures,
  seasons,
} from '../../db/drizzle/schema';
import { eq, desc, inArray, sql as drizzleSql } from 'drizzle-orm';

/**
 * Repository-backed functions below cover the identity/CRUD surface,
 * add/remove-from-club, bulk create, age progression, and every
 * aggregate-pipeline stats function - all plain SQL now, no arbitrary-query
 * surface left. See FUTURE-PLANS.md for the conversion writeup.
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

export async function updatePlayerFields(
  id: string,
  data: Partial<PlayerInterface>
) {
  return getPlayerRepo().update(id, data);
}

export async function deletePlayerById(id: string) {
  return getPlayerRepo().delete(id);
}

export async function createPlayer(data: Partial<PlayerInterface>) {
  data.Value = calculatePlayerValue(
    data.Position as string,
    data.Rating as number,
    data.Age as number
  );
  return getPlayerRepo().create(data);
}

/**
 * Toggle Signed
 *
 * Despite the name, this always sets `isSigned` to `!value` (not a real
 * toggle against current state) - callers pass the *current* isSigned
 * value and get the flipped one back, unchanged from the original
 * behavior. A plain 3-field write, no operators - `Club`/`ClubCode` are
 * direct columns on `players`, so this is the actual "add/remove player
 * to/from club" write.
 * @param playerId
 * @param value
 */
export function toggleSigned(
  playerId: string,
  value: boolean,
  clubCode: string | null,
  clubId: string | null
) {
  const fields = {
    isSigned: !value,
    ClubCode: clubCode,
    Club: clubId,
  } as unknown as Partial<PlayerInterface>;
  return updatePlayerFields(playerId, fields);
}

/**
 * Sign many Players to a Club in one write - the bulk equivalent of
 * `toggleSigned`, used by `PUT /clubs/:id/add-many-players`.
 */
export function signManyPlayersToClub(
  playerIds: string[],
  clubCode: string,
  clubId: string
) {
  const fields = {
    isSigned: true,
    ClubCode: clubCode,
    Club: clubId,
  } as unknown as Partial<PlayerInterface>;
  return getPlayerRepo().updateManyByIds(playerIds, fields);
}

/**
 * Increment every Player's Age by 1 - unconditional, fixed `+1` for every
 * row, so it's one SQL statement instead of a per-row read-modify-write.
 */
export function incrementAllPlayersAge() {
  const db = DrizzleDatabase.getInstance().database;
  return db.update(players).set({ Age: drizzleSql`${players.Age} + 1` });
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
  const fixtureIds = [
    ...new Set(rows.map((r) => r.fixtureId).filter((id): id is string => !!id)),
  ];

  const [playerRows, fixtureRows] = await Promise.all([
    playerIds.length
      ? db.query.players.findMany({
          where: inArray(players.id, playerIds),
          with: { nationality: true },
        })
      : Promise.resolve([]),
    fixtureIds.length
      ? db.query.fixtures.findMany({ where: inArray(fixtures.id, fixtureIds) })
      : Promise.resolve([]),
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
    ...(r.fixtureId !== undefined
      ? { fixture: r.fixtureId ? fixtureMap.get(r.fixtureId) : undefined }
      : {}),
    ...(r.count !== undefined ? { count: Number(r.count) } : {}),
  }));
}

/** Aggregate player stats accumulated during one game-world Year cycle
 * (`Season.Year`) - was keyed by Calendar id before the Calendar became a
 * singleton with no per-year identity of its own. */
export async function getPlayerStats(year: string) {
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
    .where(eq(seasons.Year, year))
    .groupBy(playerMatchDetails.Player)
    .orderBy(desc(drizzleSql`avg(${playerMatchDetails.Points})`));

  return attachPlayersAndFixtures(
    rows.filter((r): r is typeof r & { playerId: string } => !!r.playerId)
  );
}

const STAT_SORT_COLUMNS = {
  goals: drizzleSql<number>`sum(${playerMatchDetails.Goals})`,
  saves: drizzleSql<number>`sum(${playerMatchDetails.Saves})`,
  passes: drizzleSql<number>`sum(${playerMatchDetails.Passes})`,
  tackles: drizzleSql<number>`sum(${playerMatchDetails.Tackles})`,
  assists: drizzleSql<number>`sum(${playerMatchDetails.Assists})`,
  clean_sheets: drizzleSql<number>`sum(${playerMatchDetails.CleanSheets})`,
  dribbles: drizzleSql<number>`sum(${playerMatchDetails.Dribbles})`,
  points: drizzleSql<number>`avg(${playerMatchDetails.Points})`,
  form: drizzleSql<number>`avg(${playerMatchDetails.Form})`,
} as const;

export type PlayerStatSortKey = keyof typeof STAT_SORT_COLUMNS;

/**
 * Top players by a given cumulative/average stat, optionally scoped to one
 * Competition (by code) - replaces the old raw `getSpecificPlayerStats`,
 * which took a fully arbitrary Mongo `$match`/`$sort` object built straight
 * from client query params. The real (and only documented) use of that was
 * "filter by season.CompetitionCode, sort by one computed stat" - this
 * covers exactly that with a fixed, injection-safe column lookup instead of
 * an open-ended match/sort object.
 */
export async function getSpecificPlayerStats(
  competitionCode: string | undefined,
  sortBy: PlayerStatSortKey = 'points',
  sortDir: 'asc' | 'desc' = 'desc'
) {
  const db = DrizzleDatabase.getInstance().database;
  const sortColumn = STAT_SORT_COLUMNS[sortBy] ?? STAT_SORT_COLUMNS.points;

  const rows = await db
    .select({
      playerId: playerMatchDetails.Player,
      goals: STAT_SORT_COLUMNS.goals,
      saves: STAT_SORT_COLUMNS.saves,
      passes: STAT_SORT_COLUMNS.passes,
      tackles: STAT_SORT_COLUMNS.tackles,
      assists: STAT_SORT_COLUMNS.assists,
      clean_sheets: STAT_SORT_COLUMNS.clean_sheets,
      dribbles: STAT_SORT_COLUMNS.dribbles,
      points: STAT_SORT_COLUMNS.points,
      form: STAT_SORT_COLUMNS.form,
    })
    .from(playerMatchDetails)
    .innerJoin(fixtures, eq(playerMatchDetails.Fixture, fixtures.id))
    .innerJoin(seasons, eq(fixtures.Season, seasons.id))
    .where(
      competitionCode !== undefined
        ? eq(seasons.CompetitionCode, competitionCode)
        : undefined
    )
    .groupBy(playerMatchDetails.Player)
    .orderBy(sortDir === 'asc' ? sortColumn : desc(sortColumn));

  return attachPlayersAndFixtures(
    rows.filter((r): r is typeof r & { playerId: string } => !!r.playerId)
  );
}

export async function allPlayerStats(
  season: string
): Promise<PlayerMatchDetailsInterface[]> {
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

/**
 * Create Many Players
 */
export function createMany(playerObjects: any[]) {
  if (!playerObjects.length) return Promise.resolve([]);
  const db = DrizzleDatabase.getInstance().database;
  return db
    .insert(players)
    .values(playerObjects.map((p) => ({ ...p, updatedAt: new Date() })))
    .returning();
}
