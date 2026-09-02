import { UserRepositoryFactory } from '../../repositories/UserRepositoryFactory';
import { IUser } from './user.model';

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
 * Re-syncs `Users.Clubs` for a batch of already-owned clubs (CSV bulk
 * import's `saveClubsInUser`) - genuinely redundant with `Clubs.User` (the
 * reverse FK is the source of truth for ownership, see `user.router.ts`'s
 * `GET /:id`/`POST /:id/add-club(s)` doc comments); `Users.Clubs` doesn't
 * exist on Postgres, so this is a no-op.
 */
export function addClubsToUser(id: string, clubs: string[]) {
  return Promise.resolve(null);
}
