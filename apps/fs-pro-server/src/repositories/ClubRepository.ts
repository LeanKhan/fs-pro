import { ClubInterface } from '../controllers/clubs/club.model';

export interface IClubFilter {
  User?: string;
  League?: string;
}

/**
 * No `delete` - DELETE /clubs/:id uses `.remove()` (no repository
 * equivalent needed yet, nothing downstream reacts to it - the Mongoose
 * post('remove') cascade that would unset Manager/User/Player refs is
 * commented out in club.model.ts) and no `findByNameOrCode`-style lookup -
 * nothing needs one yet.
 *
 * `findById`/`findAll` always come back with `Address.Country` populated (a
 * full Place object nested inside `Address`, not a bare id) - club.model.ts
 * registers a schema-level `pre('find')`/`pre('findOne')` hook that
 * populates it unconditionally on every read (same pattern as Manager's
 * always-populated Nationality). `create`/`update` do NOT populate it,
 * matching Mongoose's hook (find-style queries only).
 *
 * `update()` takes plain fields only - no Mongo `$set`/`$push`/`$unset`
 * operators. Every real caller that used to send operators (Records-array
 * appends, `$unset: { Manager: 1 }`) has been rewritten to read-modify-write
 * through `club.service.ts`'s `appendClubRecord` helper instead. See
 * FUTURE-PLANS.md for the full Club conversion writeup.
 */
export interface IClubRepository {
  findById(id: string): Promise<ClubInterface | null>;
  findAll(filter?: IClubFilter): Promise<ClubInterface[]>;
  create(data: Partial<ClubInterface>): Promise<ClubInterface>;
  update(id: string, data: Partial<ClubInterface>): Promise<ClubInterface | null>;
}
