import { ManagerInterface } from '../controllers/managers/manager.model';

export interface IManagerFilter {
  isEmployed?: boolean;
  ClubId?: string;
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
  /** Also populate `Nationality` (a full Place object) - off by default.
   * Previously unconditional; made opt-in so `NationalityId` reliably
   * stays a bare id for callers (e.g. an edit form's `v-select`) that
   * don't ask for the object. */
  withNationality?: boolean;
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
 * `Nationality`/`Club` are both opt-in (`withNationality`/`withClub`) -
 * `NationalityId`/`ClubId` always pass through as bare ids regardless;
 * `create`/`update`/`delete` never populate either (nothing to join
 * against a freshly-written row).
 */
export interface IManagerRepository {
  findById(
    id: string,
    options?: IManagerReadOptions
  ): Promise<ManagerInterface | null>;
  findAll(
    filter?: IManagerFilter,
    options?: IManagerReadOptions
  ): Promise<ManagerInterface[]>;
  create(data: Partial<ManagerInterface>): Promise<ManagerInterface>;
  update(
    id: string,
    data: Partial<ManagerInterface>
  ): Promise<ManagerInterface | null>;
  delete(id: string): Promise<ManagerInterface>;
}
