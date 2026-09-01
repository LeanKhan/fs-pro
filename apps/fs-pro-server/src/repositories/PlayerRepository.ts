import { PlayerInterface } from '../controllers/players/player.model';

export interface IPlayerFilter {
  Club?: string;
  isSigned?: boolean;
}

/**
 * `findById`/`findAll` always come back with `Nationality` populated (a
 * full Place object, not a bare id) - `player.model.ts` registers a
 * schema-level `pre('find')`/`pre('findOne')` hook that populates it
 * unconditionally on every read, same pattern as Club/Manager/Competition.
 * `create`/`update`/`delete` do NOT populate it, matching Mongoose's hook.
 *
 * `update()` takes plain fields only - no Mongo `$set`/`$push` operators.
 * `updatePlayersDetails` (end-of-year rating/age progression) and the
 * generic `updatePlayers` (bulk, arbitrary-query updates) stay on the raw
 * `updateById`/`updatePlayers` in `player.service.ts`, unchanged.
 * `toggleSigned`/`signManyPlayersToClub` (add/remove player to/from a
 * club) *are* converted, via `update()`/`updateManyByIds()` - both are
 * always plain-field writes, never operators.
 *
 * `updateManyByIds()` also takes plain fields only - used for the
 * "sign several players to one club at once" case.
 *
 * `delete()` on Mongo uses `.remove()` (not `findByIdAndDelete`) to
 * preserve `player.model.ts`'s real, active `post('remove')` hook - it
 * pulls this player out of `Club.Players` (a Mongo-only array; dropped from
 * Postgres in favor of the reverse `players.Club` FK, so there's nothing to
 * pull there) and deletes this player's `PlayerMatch` history. The Drizzle
 * implementation explicitly deletes the matching `playerMatchDetails` rows
 * first (no `ON DELETE CASCADE` on that FK) to replicate the second half of
 * that cascade; the first half is a structural no-op on Postgres.
 */
export interface IPlayerRepository {
  findById(id: string): Promise<PlayerInterface | null>;
  findAll(filter?: IPlayerFilter): Promise<PlayerInterface[]>;
  create(data: Partial<PlayerInterface>): Promise<PlayerInterface>;
  update(id: string, data: Partial<PlayerInterface>): Promise<PlayerInterface | null>;
  updateManyByIds(ids: string[], data: Partial<PlayerInterface>): Promise<void>;
  delete(id: string): Promise<PlayerInterface>;
}
