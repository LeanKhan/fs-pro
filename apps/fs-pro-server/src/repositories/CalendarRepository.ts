import { CalendarInterface } from '../controllers/calendar/calendar.model';

/**
 * Exactly one row, ever - see `db/drizzle/schema.ts`'s `calendars` table doc
 * comment. `get()` bootstrap-inserts the row the first time it's called (a
 * fresh database has none yet); every call after that returns the same row.
 * `update()` takes plain fields only.
 */
export interface ICalendarRepository {
  get(): Promise<CalendarInterface>;
  update(data: Partial<CalendarInterface>): Promise<CalendarInterface>;
}
