import { IUser } from '../controllers/user/user.model';

/**
 * Deliberately smaller than IPlaceRepository - no `create`/`delete`.
 * Creation stays on the Club-coupled raw path (`user.service.ts`'s
 * `createNewUser`, used only by `POST /join`) since a freshly-created user
 * needs a Mongo ObjectId for `Club.User` to reference, and Club isn't
 * converted yet. There's no user-delete route today.
 */
export interface IUserRepository {
  findById(id: string): Promise<IUser | null>;
  findByUsername(username: string): Promise<IUser | null>;
  /**
   * If `data.Password` is present, implementations must hash it (see
   * utils/auth.ts's `hashPassword`) before persisting - this replaces the
   * Mongoose `pre('save')` hook, which a findByIdAndUpdate-style update
   * (or a Drizzle `.update()`) never triggers.
   */
  update(id: string, data: Partial<IUser>): Promise<IUser | null>;
}
