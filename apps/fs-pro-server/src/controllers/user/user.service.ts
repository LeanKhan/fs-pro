import DB from '../../db';
import log from '../../helpers/logger';
import { UserRepositoryFactory } from '../../repositories/UserRepositoryFactory';
import { IUser } from './user.model';

/**
 * Repository-backed functions below (getUserById/getUserByUsername/
 * updateUserFields) are for the identity-only surface that has no Club or
 * registration-session entanglement - see FUTURE-PLANS.md / the User
 * conversion plan for why this is split rather than converting everything.
 * The raw DB.Models.User functions above/below stay exactly as they are,
 * still used by POST /join and the /add-club(s)/clubs/:id routes.
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

export function updateUser(id: string, data: any) {
  return DB.Models.User.findByIdAndUpdate(id, data, { new: true });
}

export function updateManyUsers(query: any, update: any) {
  return DB.Models.User.updateMany(query, update, { multi: true });
}

/**
 * Create New User
 *
 * @param userData
 */
export const createNewUser = async (userData: any) => {
  const USER = new DB.Models.User(userData);

  return USER.save()
    .then((user: any) => ({ error: false, result: user }))
    .catch((err: any) => ({ error: true, result: err }));
};


export function addClubsToUser(id: string, clubs: string[]) {
  return DB.Models.User.updateOne(
    { _id: id },
    { $addToSet: { Clubs: {$each: clubs} } },
    { multi: true }
  ).lean();
}