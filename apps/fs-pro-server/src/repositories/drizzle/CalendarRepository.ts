import { and, eq } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { CalendarInterface } from '../../controllers/calendar/calendar.model';
import * as schema from '../../db/drizzle/full-schema';
import { calendars } from '../../db/drizzle/schema';
import { ICalendarRepository, ICalendarFilter } from '../CalendarRepository';

type DrizzleDb = PostgresJsDatabase<typeof schema>;
type CalendarRow = typeof calendars.$inferSelect;

/** Same `id` -> `_id` remap every other Drizzle repository does. No nested
 * populate to replicate here - Calendar has no auto-populate hook on the
 * Mongo side. `Days` is just absent from the returned object (dropped from
 * the Postgres schema, see ICalendarRepository's doc comment) rather than
 * faked as an empty array - nothing in the converted routes reads it. */
function toCalendar(row: CalendarRow): CalendarInterface {
  const { id, mongoId, ...rest } = row;
  return { _id: id, ...rest } as unknown as CalendarInterface;
}

export class DrizzleCalendarRepository implements ICalendarRepository {
  constructor(private db: DrizzleDb) {}

  async findById(id: string): Promise<CalendarInterface | null> {
    const calendar = await this.db.query.calendars.findFirst({ where: eq(calendars.id, id) });
    return calendar ? toCalendar(calendar) : null;
  }

  async findAll(filter: ICalendarFilter = {}): Promise<CalendarInterface[]> {
    const conditions = [];
    if (filter.isActive !== undefined) conditions.push(eq(calendars.isActive, filter.isActive));
    if (filter.YearString !== undefined) conditions.push(eq(calendars.YearString, filter.YearString));

    const rows = await this.db.query.calendars.findMany({
      where: conditions.length ? and(...conditions) : undefined,
    });
    return rows.map(toCalendar);
  }

  async create(data: Partial<CalendarInterface>): Promise<CalendarInterface> {
    const [calendar] = await this.db
      .insert(calendars)
      .values({ ...(data as typeof calendars.$inferInsert), updatedAt: new Date() })
      .returning();

    return toCalendar(calendar);
  }

  async update(id: string, data: Partial<CalendarInterface>): Promise<CalendarInterface | null> {
    const [calendar] = await this.db
      .update(calendars)
      .set({ ...(data as Partial<typeof calendars.$inferInsert>), updatedAt: new Date() })
      .where(eq(calendars.id, id))
      .returning();

    return calendar ? toCalendar(calendar) : null;
  }

  async delete(id: string): Promise<CalendarInterface> {
    const [calendar] = await this.db.delete(calendars).where(eq(calendars.id, id)).returning();
    if (!calendar) {
      throw new Error(`Calendar [${id}] does not exist`);
    }
    return toCalendar(calendar);
  }

  async activateYear(yearString: string): Promise<void> {
    await this.db.update(calendars).set({ isActive: false, CurrentDay: 0, updatedAt: new Date() });
    await this.db
      .update(calendars)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(calendars.YearString, yearString));
  }
}
