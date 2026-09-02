/**
 * The one perpetual timeline shared by the whole game world - see
 * `db/drizzle/schema.ts`'s `calendars` table doc comment for why this is a
 * true singleton, not one row per real-world year the way Mongo's Calendar
 * was.
 */
export interface CalendarInterface {
  _id?: string;
  CurrentDay: number;
  CurrentDate: Date;
}
