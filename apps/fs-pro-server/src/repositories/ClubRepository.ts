import { ClubInterface } from '../controllers/clubs/club.model';

export interface IClubFilter {
  User?: string;
  /** Clubs with no owning User at all - powers registration's "pick an
   * unclaimed club" list. */
  unclaimed?: boolean;
  League?: string;
  /** Batch-fetch by id - used by internal callers that build a
   * `{_id: {$in: [...]}}`-style query (App.ts, matchQueue.ts). */
  ids?: string[];
}

export interface IClubReadOptions {
  /**
   * Also populate `Players`/`Manager` (full objects, not bare ids) - matches
   * the raw `fetchAllClubs()`'s `.populate('Players Manager')`. Off by
   * default since most callers don't need it and it's an extra join(s).
   */
  withPlayersAndManager?: boolean;
}

/**
 * `findById`/`findAll` always come back with `Address.Country` populated (a
 * full Place object nested inside `Address`, not a bare id) - club.model.ts
 * registers a schema-level `pre('find')`/`pre('findOne')` hook that
 * populates it unconditionally on every read (same pattern as Manager's
 * always-populated Nationality). `create`/`update`/`delete` do NOT populate
 * it, matching Mongoose's hook (find-style queries only).
 *
 * `update()` takes plain fields only - no Mongo `$set`/`$push`/`$unset`
 * operators. Every real caller that used to send operators (Records-array
 * appends, `$unset: { Manager: 1 }`) has been rewritten to read-modify-write
 * through `club.service.ts`'s `appendClubRecord` helper instead. See
 * FUTURE-PLANS.md for the full Club conversion writeup.
 *
 * `delete()` throws if the club doesn't exist, matching every other
 * repository's `delete()` (Manager/Fixture/Season) - added alongside
 * `create()`/`update()` from the start this time, learned from the
 * create-without-delete gap found (and fixed) twice already.
 */
export interface IClubRepository {
  findById(
    id: string,
    options?: IClubReadOptions
  ): Promise<ClubInterface | null>;
  findAll(
    filter?: IClubFilter,
    options?: IClubReadOptions
  ): Promise<ClubInterface[]>;
  create(data: Partial<ClubInterface>): Promise<ClubInterface>;
  createMany(data: Partial<ClubInterface>[]): Promise<ClubInterface[]>;
  update(
    id: string,
    data: Partial<ClubInterface>
  ): Promise<ClubInterface | null>;
  delete(id: string): Promise<ClubInterface>;
}
