import { CalendarInterface } from '../controllers/calendar/calendar.model';

export interface ICalendarFilter {
  isActive?: boolean;
  YearString?: string;
}

/**
 * `update()` takes plain fields only - `Days` is a recognized-but-inert key
 * on Postgres (dropped from the schema, it's the exact inverse of
 * `days.Calendar` - each Day already carries its own `Calendar` FK at
 * creation time in `calendar.controller.ts`'s `setupDaysInYear(2)`, so
 * writing it here is a real array write on Mongo and a harmless no-op on
 * Postgres, same pattern as Season's `Fixtures`).
 *
 * `activateYear()` covers `startYear`'s "flip every calendar's `isActive`
 * in one go" operation - on Mongo this was a single aggregation-pipeline
 * update (`$set: { isActive: { $eq: ['$YearString', year] } }`, computing a
 * different value per row); Postgres has no per-row-computed `$set`
 * equivalent via Drizzle's plain `update()`, so it's implemented as two
 * statements there (deactivate everything, then activate the one match) -
 * behaviorally identical (there's never more than a handful of Calendar
 * rows, so two round-trips isn't a real cost).
 *
 * The Days-array-*building* game-loop (`createSeasonsInTheYear`,
 * `setupDaysInYear(2)`'s own Day-construction logic) has no Calendar-repository
 * shape of its own to convert - it's Season/Day construction, already routed
 * through their own converted paths. Day itself still has no repository
 * (see FUTURE-PLANS.md - it's next in the Phase B order).
 */
export interface ICalendarRepository {
  findById(id: string): Promise<CalendarInterface | null>;
  findAll(filter?: ICalendarFilter): Promise<CalendarInterface[]>;
  create(data: Partial<CalendarInterface>): Promise<CalendarInterface>;
  update(id: string, data: Partial<CalendarInterface>): Promise<CalendarInterface | null>;
  delete(id: string): Promise<CalendarInterface>;
  /** Deactivate every calendar, then activate (and reset `CurrentDay` to 0
   * on) the one whose `YearString` matches. */
  activateYear(yearString: string): Promise<void>;
}
