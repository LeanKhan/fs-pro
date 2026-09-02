import { ManagerInterface } from '../controllers/managers/manager.model';

export interface IManagerFilter {
  isEmployed?: boolean;
  Club?: string;
}

export interface IManagerReadOptions {
  /**
   * Also populate `Club` (a full Club object, selected down to
   * `Name`/`ClubCode`/`LeagueCode` - matches the `.populate('Club', 'Name
   * ClubCode LeagueCode')` projection `manager.service.ts`'s raw
   * `fetchAll`/`fetchOneById` used, now that Club has its own repository).
   * Off by default since most callers don't need it and it's an extra join.
   */
  withClub?: boolean;
}

/**
 * `delete` throws if the manager doesn't exist, matching the old raw
 * `deleteByRemove`'s `if (!doc) throw ...` behavior - DELETE /managers/:id
 * now goes fully through the repository (fetch, Club-side unset via
 * `appendClubRecord`, then this), so it works correctly against a
 * Postgres-native manager under `backend=drizzle` too. See
 * FUTURE-PLANS.md for the full writeup (this closed a real gap the Club
 * conversion surfaced: the old raw delete resolved to the Mongo *fallback*
 * connection even under `backend=drizzle`, so it couldn't find a
 * Postgres-only manager at all).
 *
 * `findById`/`findAll` always come back with `Nationality` populated (a
 * full Place object, not a bare id) - `manager.model.ts` registers a
 * schema-level `pre('find')`/`pre('findOne')` hook that populates it
 * unconditionally on every read, so both repositories have to match that,
 * not just replicate the field as a raw FK. `create`/`update`/`delete` do
 * NOT populate it (Mongoose's hook only fires for find-style queries, not
 * `.save()`/`findByIdAndUpdate`/`findByIdAndDelete`) - matches today's
 * behavior exactly.
 */
export interface IManagerRepository {
  findById(id: string, options?: IManagerReadOptions): Promise<ManagerInterface | null>;
  findAll(filter?: IManagerFilter, options?: IManagerReadOptions): Promise<ManagerInterface[]>;
  create(data: Partial<ManagerInterface>): Promise<ManagerInterface>;
  update(id: string, data: Partial<ManagerInterface>): Promise<ManagerInterface | null>;
  delete(id: string): Promise<ManagerInterface>;
}
