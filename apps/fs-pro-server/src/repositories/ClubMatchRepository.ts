import { ClubMatchDetailsInterface } from '../controllers/club-match/club-match.model';

/**
 * `PlayerStats` (an array of `PlayerMatchDetails` ids on Mongo) doesn't
 * exist on Postgres - dropped in favor of the reverse
 * `playerMatchDetails.ClubMatchDetails` FK, same array-vs-reverse-FK
 * pattern as everywhere else in this migration. `create()`/`update()` still
 * accept it (Mongo does a real array write, Postgres silently ignores the
 * unknown key) - see `game/functions.ts`'s `savePlayerAndClubStats` for the
 * one real call site, which creates the ClubMatchDetails row *before* its
 * PlayerMatchDetails rows so each of those can set the FK back to it (the
 * reverse of Mongo's old ordering, which created PlayerMatchDetails first
 * to get ids for the ClubMatchDetails array - now unified into one order
 * that works on both backends).
 */
export interface IClubMatchRepository {
  findById(id: string): Promise<ClubMatchDetailsInterface | null>;
  create(data: Partial<ClubMatchDetailsInterface>): Promise<ClubMatchDetailsInterface>;
  update(id: string, data: Partial<ClubMatchDetailsInterface>): Promise<ClubMatchDetailsInterface | null>;
  delete(id: string): Promise<ClubMatchDetailsInterface>;
}
