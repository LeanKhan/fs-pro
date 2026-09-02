import { SeasonInterface } from '../controllers/seasons/season.model';

export interface ISeasonFilter {
  Competition?: string;
  Calendar?: string;
  Year?: string;
  SeasonCode?: string;
}

/**
 * No auto-populate hook on Season, but `season.service.ts`'s raw
 * `fetchOneById` defaults its `populate` argument to `'Fixtures'` - passing
 * `undefined` explicitly (as `season.router.ts`'s `GET /:id` route does)
 * still triggers that default, so in practice every plain `GET /:id` comes
 * back with `Fixtures` populated (a full array of Fixture docs - just the
 * base fields, not their own nested `HomeSideDetails`/`AwaySideDetails`,
 * since Mongoose populate is single-level). `findById` replicates that via
 * the `fixtures` relation from `relations.ts`. Any other explicit
 * `?populate=` path stays raw.
 *
 * `update()` takes plain fields only - every real caller
 * (`season.router.ts`, `middleware/seasons.ts`, `season.controller.ts`)
 * already only ever calls `findByIdAndUpdate` with plain field objects, no
 * Mongo operators, but most of those call sites stay raw anyway: they're
 * deep in the fixture-generation/standings/prolegation game loop, and some
 * write fields (`Fixtures`, an array) that don't exist on the Postgres
 * schema at all (dropped in favor of the reverse `fixtures.Season` FK) -
 * harmless to pass through (Drizzle just ignores the unknown key) but not
 * worth converting untested, interdependent game-loop internals for. Only
 * `PATCH /:id/start`'s isolated `{ isStarted, StartDate }` write was
 * converted.
 */
export interface ISeasonRepository {
  findById(id: string): Promise<SeasonInterface | null>;
  findAll(filter?: ISeasonFilter): Promise<SeasonInterface[]>;
  create(data: Partial<SeasonInterface>): Promise<SeasonInterface>;
  update(id: string, data: Partial<SeasonInterface>): Promise<SeasonInterface | null>;
  delete(id: string): Promise<SeasonInterface>;
}
