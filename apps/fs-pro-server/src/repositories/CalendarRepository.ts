import { CalendarInterface } from '../controllers/calendar/calendar.model';

export interface ICalendarFilter {
  isActive?: boolean;
}

/**
 * `update()` takes plain fields only - no Mongo `$set`/aggregation-pipeline
 * updates. `startYear` (`calendar.controller.ts`) uses an aggregation-style
 * update (`updateCalendars({}, [{ $set: { isActive: { $eq: [...] } } }])`)
 * to flip every calendar's `isActive` in one multi-document write - that's
 * a genuinely different operation (compute-per-row, not a fixed value) and
 * stays on the raw `findAndUpdate` in `calendar.service.ts`. The whole
 * Days-array-building game-loop (`createSeasonsInTheYear`,
 * `setupDaysInYear(2)`) also stays raw - `Calendar.Days` was dropped from
 * the Postgres schema (it's the inverse of `days.Calendar`), and Day itself
 * isn't converted (its real read path, `GET /:year/days`, needs
 * `Matches.Fixture` populate, which needs Fixture). See FUTURE-PLANS.md.
 */
export interface ICalendarRepository {
  findById(id: string): Promise<CalendarInterface | null>;
  findAll(filter?: ICalendarFilter): Promise<CalendarInterface[]>;
  create(data: Partial<CalendarInterface>): Promise<CalendarInterface>;
  update(id: string, data: Partial<CalendarInterface>): Promise<CalendarInterface | null>;
  delete(id: string): Promise<CalendarInterface>;
}
