import { Fixture as FixtureInterface } from '../controllers/fixtures/fixture.model';

export interface IFixtureFilter {
  SeasonId?: string;
  Played?: boolean;
  /** Batch-fetch by id. */
  ids?: string[];
  /** Exact `ScheduledDay` match - "what's playing on day N". */
  scheduledDay?: number;
  /** Inclusive `ScheduledDay` range - "what's playing between day N and M". */
  scheduledDayFrom?: number;
  scheduledDayTo?: number;
}

export interface IFixtureReadOptions {
  /** Populate `HomeTeam`/`AwayTeam` with the full Club (Players + Manager),
   * replacing the raw FK id - mirrors Mongoose's old in-place `.populate()`
   * behavior. Off by default: the match engine (`matchQueue.ts`,
   * `game.controller.ts`) reads `HomeTeam`/`AwayTeam` as a bare id string
   * via `.toString()`, and the dashboard/list views only ever need the
   * plain `Home`/`Away` club-code text columns - only `GET /fixtures/:id`
   * (Matchzone) needs the populated object. */
  withClub?: boolean;
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
 * from Postgres in favor of the reverse `fixtures.SeasonId` FK, so there's
 * nothing to pull there.
 */
export interface IFixtureRepository {
  findById(
    id: string,
    options?: IFixtureReadOptions
  ): Promise<FixtureInterface | null>;
  findAll(
    filter?: IFixtureFilter,
    options?: IFixtureReadOptions
  ): Promise<FixtureInterface[]>;
  create(data: Partial<FixtureInterface>): Promise<FixtureInterface>;
  /** Bulk fixture-generation insert (season/day setup's round-robin
   * schedule) - each fixture is already fully FK-correct at construction
   * time (Season/HomeTeam/AwayTeam), so this is a plain bulk insert, not a
   * different write shape from `create()`. */
  createMany(data: Partial<FixtureInterface>[]): Promise<FixtureInterface[]>;
  update(
    id: string,
    data: Partial<FixtureInterface>
  ): Promise<FixtureInterface | null>;
  delete(id: string): Promise<FixtureInterface>;
}
