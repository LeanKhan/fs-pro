import DB from '../../db';
import { DrizzleDatabase } from '../../db/drizzle';
import { days } from '../../db/drizzle/schema';
import { and, asc, eq, gt, sql as drizzleSql } from 'drizzle-orm';
import { DayInterface, CalendarMatchInterface } from './day.model';
import { DayRepositoryFactory } from '../../repositories/DayRepositoryFactory';
import { getFixtures } from '../fixtures/fixture.service';

/**
 * `IDayRepository` only covers identity/CRUD - `Matches` is a jsonb array
 * of embedded match summaries on Postgres (dropped from being a relation
 * the way Mongo's `populate({path:'Matches.Fixture'})` treats it), so every
 * function below that needs Matches.Fixture populated, or needs to query
 * *into* the Matches array, branches on `DB.ormType` directly instead of
 * going through the repository - same shape as Player's
 * `getPlayerStats`/`allPlayerStats`. The Drizzle branches batch-fetch
 * distinct Fixture ids out of the fetched Matches arrays via
 * `getFixtures({ids})` and merge them back in JS (`attachFixturesToDays`),
 * mirroring `player.service.ts`'s `attachPlayersAndFixtures`.
 */
let dayRepo: ReturnType<typeof DayRepositoryFactory.create> | null = null;

function getDayRepo() {
  if (!dayRepo) {
    dayRepo = DayRepositoryFactory.create();
  }
  return dayRepo;
}

export async function getDayById(id: string) {
  return getDayRepo().findById(id);
}

export async function createDay(data: Partial<DayInterface>) {
  return getDayRepo().create(data);
}

export async function createManyDays(data: Partial<DayInterface>[]) {
  return getDayRepo().createMany(data);
}

export async function updateDayFields(id: string, data: Partial<DayInterface>) {
  return getDayRepo().update(id, data);
}

export async function deleteDayById(id: string) {
  return getDayRepo().delete(id);
}

function remapRowId<T extends { id: string; mongoId: string | null }>(row: T) {
  const { id, mongoId, ...rest } = row;
  return { _id: id, ...rest };
}

/** Batch-fetches the distinct Fixture ids referenced across a set of Days'
 * `Matches` arrays and replaces each entry's bare `Fixture` id with the
 * full Fixture object - the Drizzle equivalent of Mongo's
 * `populate({path: 'Matches.Fixture'})`. */
async function attachFixturesToDays<T extends { Matches: CalendarMatchInterface[] }>(dayRows: T[]): Promise<T[]> {
  const fixtureIds = [...new Set(dayRows.flatMap((d) => d.Matches.map((m) => m.Fixture)).filter(Boolean))];
  const fixtureMap = new Map(
    fixtureIds.length ? (await getFixtures({ ids: fixtureIds })).map((f: any) => [f._id, f]) : []
  );

  return dayRows.map((d) => ({
    ...d,
    Matches: d.Matches.map((m) => ({ ...m, Fixture: (fixtureMap.get(m.Fixture) ?? m.Fixture) as any })),
  }));
}

/**
 * Days of a Calendar year - the real read path behind `GET /:year/days`.
 * Always returns `Matches.Fixture` populated (a superset of what every
 * caller actually asks for - simplest to always do it, same call as the
 * raw path's own `populate=true` branch made in practice).
 */
export async function getDaysForYear(filter: {
  Year: string;
  isFree?: boolean;
  notPlayed?: boolean;
  limit?: number;
}): Promise<DayInterface[]> {
  if (DB.ormType === 'drizzle') {
    const db = DrizzleDatabase.getInstance().database;
    const conditions = [eq(days.Year, filter.Year)];
    if (filter.isFree !== undefined) conditions.push(eq(days.isFree, filter.isFree));

    let rows = await db.query.days.findMany({ where: and(...conditions), orderBy: asc(days.Day) });
    if (filter.notPlayed) {
      rows = rows.filter((d) => (d.Matches as unknown as CalendarMatchInterface[]).some((m) => m.Played === false));
    }
    if (filter.limit !== undefined) rows = rows.slice(0, filter.limit);

    const mapped = rows.map(remapRowId) as unknown as { Matches: CalendarMatchInterface[] }[];
    return attachFixturesToDays(mapped) as unknown as Promise<DayInterface[]>;
  }

  const query: Record<string, unknown> = { Year: filter.Year };
  if (filter.isFree !== undefined) query.isFree = filter.isFree;
  if (filter.notPlayed) query['Matches.Played'] = false;

  let q = DB.Models.Day.find(query)
    .populate({ path: 'Matches.Fixture', model: 'Fixture' })
    .sort('Day');
  if (filter.limit !== undefined) q = q.limit(filter.limit);

  return q.lean().exec();
}

/**
 * Paged Days for a Calendar, used by Calendar's `fetchOne(..., populate)`.
 * This intentionally mirrors `Calendar.populate('Days')` only - it does not
 * populate `Matches.Fixture`; routes that need that richer shape use
 * `getDaysForYear`/`findDayByFixtureId`.
 */
export async function getDaysForCalendarPage(filter: {
  Calendar: string;
  skip?: number;
  limit?: number;
}): Promise<DayInterface[]> {
  const skip = filter.skip ?? 0;
  const limit = filter.limit ?? 14;

  if (DB.ormType === 'drizzle') {
    const db = DrizzleDatabase.getInstance().database;
    const rows = await db.query.days.findMany({
      where: eq(days.Calendar, filter.Calendar),
      orderBy: asc(days.Day),
      offset: skip,
      limit,
    });

    return rows.map(remapRowId) as unknown as DayInterface[];
  }

  return DB.Models.Day.find({ Calendar: filter.Calendar })
    .sort('Day')
    .skip(skip)
    .limit(limit)
    .lean()
    .exec();
}

/**
 * Finds the Day containing a given Fixture. Always populates
 * `Matches.Fixture` unless `populate: false` is explicitly passed
 * (`markMatchPlayed` needs the bare ids back, so it can write the array
 * back unchanged apart from the one flipped `Played` flag).
 */
export async function findDayByFixtureId(
  fixtureId: string,
  options: { populate?: boolean } = {}
): Promise<DayInterface | null> {
  const populate = options.populate !== false;

  if (DB.ormType === 'drizzle') {
    const db = DrizzleDatabase.getInstance().database;
    const row = await db.query.days.findFirst({
      where: drizzleSql`${days.Matches} @> ${JSON.stringify([{ Fixture: fixtureId }])}::jsonb`,
    });
    if (!row) return null;

    const day = remapRowId(row);
    return (populate ? (await attachFixturesToDays([day as any]))[0] : day) as unknown as DayInterface;
  }

  const query = DB.Models.Day.findOne({ 'Matches.Fixture': fixtureId });
  if (populate) {
    query.populate({ path: 'Matches.Fixture', model: 'Fixture' });
  }
  return query.lean().exec();
}

/**
 * The `changeCurrentDay` lookup - first non-free Day after `afterDay` in
 * `year` with no match played yet. No populate needed (only `.Day` is
 * read by the caller).
 */
export async function findNextPlayableDay(year: string, afterDay: number): Promise<DayInterface | null> {
  if (DB.ormType === 'drizzle') {
    const db = DrizzleDatabase.getInstance().database;
    const rows = await db.query.days.findMany({
      where: and(eq(days.Year, year), eq(days.isFree, false), gt(days.Day, afterDay)),
      orderBy: asc(days.Day),
    });
    const match = rows.find((d) => !(d.Matches as unknown as CalendarMatchInterface[]).some((m) => m.Played === true));
    return match ? (remapRowId(match) as unknown as DayInterface) : null;
  }

  return DB.Models.Day.findOne({
    Year: year,
    isFree: false,
    Day: { $gt: afterDay },
    $nor: [{ 'Matches.Played': true }],
  })
    .sort('Day')
    .lean()
    .exec();
}

/**
 * Marks the Match entry for `fixtureId` as `Played` inside its Day - was a
 * Mongo positional update (`findOneAndUpdate` + `$set: {'Matches.$.Played':
 * true}`); Postgres has no positional-array-element update via Drizzle's
 * plain `update()`, so this is a read-modify-write instead (fetch the Day
 * with bare Fixture ids, flip the one entry in JS, write the whole array
 * back) - safe since match-finish writes for a given fixture aren't
 * concurrent with each other.
 */
export async function markMatchPlayed(fixtureId: string): Promise<DayInterface> {
  const day: any = await findDayByFixtureId(fixtureId, { populate: false });
  if (!day) {
    throw new Error('Match Day does not exist!');
  }

  const matchIndex = (day.Matches as CalendarMatchInterface[]).findIndex(
    (m) => m.Fixture.toString() === fixtureId.toString()
  );
  if (matchIndex === -1) {
    throw new Error('Match Day does not exist!');
  }

  const updatedMatches = (day.Matches as CalendarMatchInterface[]).map((m, i) =>
    i === matchIndex ? { ...m, Played: true } : m
  );

  const updated = await updateDayFields(day._id, { Matches: updatedMatches } as any);
  if (!updated) {
    throw new Error('Match Day does not exist!');
  }
  return updated;
}
