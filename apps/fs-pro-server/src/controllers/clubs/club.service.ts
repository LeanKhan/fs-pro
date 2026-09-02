// Exposes functions that are used to interact with the DB directly
import DB from '../../db';
import { Types } from 'mongoose';
import { Club, ClubInterface } from './club.model';
import log from '../../helpers/logger';
import { IClub } from '../../interfaces/Club';
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
 * fetchAllClubs mate
 *
 * Returns all the clubs in the game
 * @returns - {error: boolean, result: any | IClubModel}
 */
export function fetchAllClubs() {
  return DB.Models.Club.find({}).populate('Players Manager').lean().exec();
}

/**
 * fetchClubs
 */
export function fetchClubs(
  condition: any,
  select?: string | boolean
): Promise<IClub[]> {
  // TODO: check if you can send all these options as an object....
  if (select) {
    return DB.Models.Club.find(condition).select(select).lean().exec();
  }
  return DB.Models.Club.find(condition).populate('Players').lean().exec();
}


/**
 * fecthSingleClubById
 *
 * get a single club by its id brooooo
 *
 * @param id Club id
 */
export function fetchSingleClubById(
  id: any,
  populate: string | boolean
): Promise<ClubInterface> {

  if (populate) {
    let po = '';

    try {
      po = JSON.parse(populate as string);
      // this could be an array!
    } catch (err) {
      console.error(`Error parsing populate field => ${err}`);
      throw new Error(`Cannot parse populate query => ${err}`);
    }
    // Accpet object to populate fields
    return DB.Models.Club.findById(id).populate(po).lean().exec();
  } else {
    return DB.Models.Club.findById(id).lean().exec();
  }
}

/**
 * Fetch League Clubs doe...
 * @param clubId
 * @param playerId
 */
export function fetchLeagueClubs(_clubs: string[]) {
  return DB.Models.Club.find({ _id: { $in: _clubs } })
    .select('ClubCode Name Address Stadium')
    .lean()
    .exec();
}
/**
 * Add player to club
 * @param clubId
 * @param playerId
 */
export function addPlayerToClub(clubId: string, playerId: string) {
  return DB.Models.Club.findByIdAndUpdate(clubId, {
    $push: { Players: playerId },
  })
    .lean()
    .exec();
}

/**
 * Calculate the clubs Average Rating...
 *
 * Mongo groups by `$lookup`-ing `Club.Players` (an array of ids) into
 * `Players`; Postgres has no such array (dropped in favor of the reverse
 * `players.Club` FK - see FUTURE-PLANS.md), so the Drizzle branch just
 * groups `players` directly by `Club = clubId` instead. Same output shape
 * either way: `{ position, avg_rating, count }[]`.
 *
 * @param clubId
 */
export async function calculateClubsTotalRatings(clubId: string) {
  if (DB.ormType === 'drizzle') {
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

  // TODO: Guy! Just do the calculation yourself!
  // Do first stage grouping...
  return DB.Models.Club.aggregate(
    [
      { $match: { _id: new Types.ObjectId(clubId) } },
      {
        $lookup: {
          from: 'Players',
          localField: 'Players',
          foreignField: '_id',
          as: 'players',
        },
      },
      { $unwind: '$players' },
      {
        $group: {
          _id: '$players.Position',
          avg_rating: { $avg: '$players.Rating' },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          position: '$_id',
          avg_rating: 1,
          count: 1,
        },
      },
    ],
    () => {
      log('Aggregate performed!');
    }
  );
}

/**
 * createNewClub mate
 *
 * @param c Club making data
 * @returns - {error: boolean, result: any | IClubModel}
 */
export function createNewClub(_club: any) {
  const CLUB = new DB.Models.Club(_club);

  return CLUB.save()
    .then((club: any) => ({ error: false, result: club }))
    .catch((error: any) => ({ error: true, result: error }));
}

// Clubs _must_ always be in a league
// they may not necessarily be in a cup or tournament...

/**
 * Add LeagueCode to Club
 * @param playerId
 * @param value
 */
export function updateClubLeague(
  clubId: string,
  leagueCode: string,
  leagueId: string
) {
  return DB.Models.Club.findByIdAndUpdate(clubId, {
    $set: { LeagueCode: leagueCode, League: leagueId },
  })
    .lean()
    .exec();
}

/**
 * update club
 */

export function updateClub(
  clubId: string,
  data: any = {}
): Promise<ClubInterface> {
  return DB.Models.Club.findByIdAndUpdate(clubId, data, { new: true })
    .lean()
    .exec();
}

export function updateClubsById(clubIds: string[], data: any = {}) {
  return DB.Models.Club.updateMany({ _id: { $in: clubIds } }, data, {
    new: true,
  })
    .lean()
    .exec();
}

/**
 * Create Many Clubs
 */
export function createMany(clubs: any[]) {
  return DB.Models.Club.insertMany(clubs, { ordered: true });
}

interface IClubsResponse {
  error: boolean;
  message?: string;
  result: Club[];
}

// interface ServiceResponse {
//   error: boolean;
//   message?
// }
