import { DayInterface } from '../controllers/days/day.model';

/**
 * Deliberately minimal - just identity/CRUD. Day's real complexity (the
 * `Matches.Fixture` populate, the "day for this fixture"/"next playable
 * day" lookups, the positional `Matches.$.Played` write) isn't a good fit
 * for a generic repository interface, since `Matches` is a jsonb array of
 * embedded match summaries on Postgres, not a relation - those live as
 * branching functions directly in `day.service.ts` instead (same shape as
 * Player's `getPlayerStats`/`allPlayerStats`), reusing this repository's
 * `findById`/`update` underneath. See `day.service.ts`'s doc comment for
 * the details.
 */
export interface IDayRepository {
  findById(id: string): Promise<DayInterface | null>;
  create(data: Partial<DayInterface>): Promise<DayInterface>;
  createMany(data: Partial<DayInterface>[]): Promise<DayInterface[]>;
  update(id: string, data: Partial<DayInterface>): Promise<DayInterface | null>;
  delete(id: string): Promise<DayInterface>;
}
