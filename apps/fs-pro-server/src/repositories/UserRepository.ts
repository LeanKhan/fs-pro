import { IUser } from '../controllers/user/user.model';

/**
 * Deliberately smaller than IPlaceRepository - no `delete` (there's no
 * user-delete route today). `create()` was deferred past the original User
 * conversion pass since registration (`POST /join`) chains straight into
 * `updateClubs` (Club-coupled) and Club wasn't converted yet at the time -
 * Club is fully converted now (see FUTURE-PLANS.md), so registration no
 * longer needs the raw Mongo path either.
 */
export interface IUserRepository {
  findById(id: string): Promise<IUser | null>;
  findByUsername(username: string): Promise<IUser | null>;
  /**
   * If `data.Password` is present, implementations must hash it (see
   * utils/auth.ts's `hashPassword`) before persisting - this replaces the
   * Mongoose `pre('save')` hook, which a findByIdAndUpdate-style update
   * (or a Drizzle `.update()`/`.insert()`) never triggers.
   */
  create(data: Partial<IUser>): Promise<IUser>;
  update(id: string, data: Partial<IUser>): Promise<IUser | null>;
}
