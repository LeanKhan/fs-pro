/**
 * Sparse - a row only exists for a day that actually needs one (a real,
 * non-match calendar event). Matches are no longer embedded here at all -
 * see fixtures.ScheduledDay/ScheduledDate in `db/drizzle/schema.ts` and
 * `fixture.service.ts`'s `getFixturesByDay`/`getFixturesInRange`.
 */
export interface DayInterface {
  _id?: string;
  /** Global absolute day number - counts up forever from the start of the
   * game world, not scoped to any particular year. */
  Index: number;
  Date: Date;
  Events?: Record<string, unknown>[];
}
