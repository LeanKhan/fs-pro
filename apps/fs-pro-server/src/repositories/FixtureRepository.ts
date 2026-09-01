import { Fixture as FixtureInterface } from '../controllers/fixtures/fixture.model';

export interface IFixtureFilter {
  Season?: string;
  Played?: boolean;
  /** Batch-fetch by id - used by Day's Matches.Fixture populate merge
   * (day.service.ts), since Matches is a jsonb array of bare Fixture ids,
   * not a Drizzle relation. */
  ids?: string[];
}

/**
 * No auto-populate hook on Fixture (unlike Player/Manager/Club/Competition)
 * - but `fixture.service.ts`'s raw `fetchOneById` always populates
 * `HomeSideDetails`/`AwaySideDetails` (each with their own `PlayerStats`)
 * regardless of its `populate` argument, so `findById` replicates that same
 * baseline here via the `homeSideDetails`/`awaySideDetails` relations (each
 * with `playerStats`) - only the *extra*, arbitrary populate path
 * (`?populate=...` on `GET /fixtures/:id`) is what actually varies, and
 * that case stays on the raw path.
 *
 * `update()` takes plain fields only - `findOneAndUpdate` (arbitrary
 * query + update, used throughout the match engine to record match state)
 * stays raw, unchanged - this is the same class of exclusion as Club's
 * generic `updateClub`/Competition's generic `update`.
 *
 * `delete()` on Mongo uses `.remove()` (not `findByIdAndDelete`) to
 * preserve `fixture.model.ts`'s real, active `post('remove')` hook, which
 * pulls this fixture out of `Season.Fixtures` - a Mongo-only array, dropped
 * from Postgres in favor of the reverse `fixtures.Season` FK, so there's
 * nothing to pull there.
 */
export interface IFixtureRepository {
  findById(id: string): Promise<FixtureInterface | null>;
  findAll(filter?: IFixtureFilter): Promise<FixtureInterface[]>;
  create(data: Partial<FixtureInterface>): Promise<FixtureInterface>;
  update(id: string, data: Partial<FixtureInterface>): Promise<FixtureInterface | null>;
  delete(id: string): Promise<FixtureInterface>;
}
