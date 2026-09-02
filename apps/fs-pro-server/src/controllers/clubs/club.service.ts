// Exposes functions that are used to interact with the DB directly
import { ClubInterface } from './club.model';
import { ClubRepositoryFactory } from '../../repositories/ClubRepositoryFactory';
import { IClubFilter, IClubReadOptions } from '../../repositories/ClubRepository';
import { DrizzleDatabase } from '../../db/drizzle';
import { players } from '../../db/drizzle/schema';
import { eq, sql as drizzleSql } from 'drizzle-orm';

/**
 * Repository-backed functions below are for the identity/CRUD surface that
 * has no Mongo-operator ($set/$push/$unset) update in play. `update()` on
 * the repository only ever accepts plain fields - every caller below that
 * used to build a `$push`/`$unset` update object (hiring/firing a manager,
 * clearing a club's owner) goes through `appendClubRecord`, which reads the
 * current Records array and writes the appended version back as a plain
 * field, instead. See FUTURE-PLANS.md for the full Club conversion writeup.
 */
let clubRepo: ReturnType<typeof ClubRepositoryFactory.create> | null = null;

function getClubRepo() {
  if (!clubRepo) {
    clubRepo = ClubRepositoryFactory.create();
  }
  return clubRepo;
}

export async function getClubById(id: string, options?: IClubReadOptions) {
  return getClubRepo().findById(id, options);
}

export async function getClubs(filter?: IClubFilter, options?: IClubReadOptions) {
  return getClubRepo().findAll(filter, options);
}

export async function createClub(data: Partial<ClubInterface>) {
  return getClubRepo().create(data);
}

export async function createManyClubs(data: Partial<ClubInterface>[]) {
  return getClubRepo().createMany(data);
}

export async function updateClubFields(id: string, data: Partial<ClubInterface>) {
  return getClubRepo().update(id, data);
}

export async function deleteClubById(id: string) {
  return getClubRepo().delete(id);
}

/**
 * Update a Club's plain fields and append one entry to its Records array in
 * the same write - replaces the `$push: { Records: ... }` pattern every
 * Mongo-operator call site used, since the repository's `update()` doesn't
 * support operators. Read-modify-write is safe here: every real caller
 * (hiring/firing a manager, a manager's DELETE route clearing its club)
 * already reads the club first for other reasons, so this isn't adding an
 * extra round trip in practice.
 */
export async function appendClubRecord(
  id: string,
  fields: Record<string, unknown>,
  record: unknown
) {
  const club = await getClubRepo().findById(id);
  const records = [...(club?.Records ?? []), record];
  return getClubRepo().update(id, { ...fields, Records: records } as Partial<ClubInterface>);
}

/**
 * Calculate the clubs Average Rating - groups `players` directly by
 * `Club = clubId` (Mongo used to `$lookup`/`$unwind`/`$group` off
 * `Club.Players`, an array Postgres dropped in favor of this reverse
 * `players.Club` FK). Output shape: `{ position, avg_rating, count }[]`.
 */
export async function calculateClubsTotalRatings(clubId: string) {
  const db = DrizzleDatabase.getInstance().database;
  const rows = await db
    .select({
      position: players.Position,
      avg_rating: drizzleSql<number>`avg(${players.Rating})`,
      count: drizzleSql<number>`count(*)`,
    })
    .from(players)
    .where(eq(players.Club, clubId))
    .groupBy(players.Position);

  return rows.map((r) => ({
    position: r.position,
    avg_rating: Number(r.avg_rating),
    count: Number(r.count),
  }));
}
