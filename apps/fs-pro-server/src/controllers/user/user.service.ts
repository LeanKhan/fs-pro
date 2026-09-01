import DB from '../../db';
import log from '../../helpers/logger';
import { UserRepositoryFactory } from '../../repositories/UserRepositoryFactory';
import { IUser } from './user.model';

/**
 * Repository-backed functions below cover identity/CRUD, including
 * registration (`createUser`) now that Club (its one real coupling, via
 * `updateClubs`) is fully converted too - see FUTURE-PLANS.md for the
 * follow-up entry closing this out. The raw DB.Models.User functions
 * further below (`fetchUser`/`getUserSession`/`fetchOneUser`/
 * `updateManyUsers`/`alertAllUsers`'s `updateManyUsers` call) have no
 * remaining real callers - dead code left over from before this and
 * earlier passes, not touched here.
 */
let userRepo: ReturnType<typeof UserRepositoryFactory.create> | null = null;

function getUserRepo() {
  if (!userRepo) {
    userRepo = UserRepositoryFactory.create();
  }
  return userRepo;
}

export async function getUserById(id: string) {
  return getUserRepo().findById(id);
}

export async function getUserByUsername(username: string) {
  return getUserRepo().findByUsername(username);
}

export async function createUser(data: Partial<IUser>) {
  return getUserRepo().create(data);
}

export async function updateUserFields(id: string, data: Partial<IUser>) {
  return getUserRepo().update(id, data);
}

/**
 * fetch one user by Id
 *
 * @param id,
 * @param populate default false
 */
export function fetchUser(id: string, populate = false) {
  if (populate) {
    return DB.Models.User.findById(id).populate('Clubs').lean().exec();
  } else {
    return DB.Models.User.findById(id).lean().exec();
  }
}

/** fetch User session */
export function getUserSession(id: string, session: string) {
  return DB.Models.User.findById(id).then((user: any) => {
    user!.findSession(session, (a: any, sess: any) => {
      if (sess) {
        log('Session =>', sess);
        return sess;
      }
    });
  });
}

/**
 * fetch a user by a query
 * @param query
 */
export function fetchOneUser(
  query: Record<string, unknown>,
  doc = false,
  populate = false
) {
  if (doc && !populate) {
    return DB.Models.User.findOne(query).exec();
  }

  if (populate) {
    return DB.Models.User.findOne(query).populate('Clubs').lean().exec();
  }

  return DB.Models.User.findOne(query).populate('Clubs').lean().exec();
}

// export function findUserAndComparePassword(query: {}) {
//   // tslint:disable-next-line: only-arrow-functions
//   return DB.Models.User.findOne(query).exec();
// }

/**
 *
 * @param userData
 */

export function updateManyUsers(query: any, update: any) {
  return DB.Models.User.updateMany(query, update, { multi: true });
}

/**
 * Re-syncs `Users.Clubs` for a batch of already-owned clubs (CSV bulk
 * import's `saveClubsInUser`) - genuinely redundant with `Clubs.User` (the
 * reverse FK both backends now treat as the source of truth for ownership,
 * see `user.router.ts`'s `GET /:id`/`POST /:id/add-club(s)` doc comments),
 * so this is a no-op under `backend=drizzle` (`Users.Clubs` doesn't exist
 * on Postgres) and a real array write on Mongo, same pattern as Club's
 * `Players`/Competition's `Clubs`/`Seasons`.
 */
export function addClubsToUser(id: string, clubs: string[]) {
  if (DB.ormType === 'drizzle') {
    return Promise.resolve(null);
  }

  return DB.Models.User.updateOne(
    { _id: id },
    { $addToSet: { Clubs: {$each: clubs} } },
    { multi: true }
  ).lean();
}