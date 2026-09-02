import { eq } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { CalendarInterface } from '../../controllers/calendar/calendar.model';
import * as schema from '../../db/drizzle/full-schema';
import { calendars } from '../../db/drizzle/schema';
import { ICalendarRepository } from '../CalendarRepository';

type DrizzleDb = PostgresJsDatabase<typeof schema>;
type CalendarRow = typeof calendars.$inferSelect;

function toCalendar(row: CalendarRow): CalendarInterface {
  const { id, singleton, ...rest } = row;
  return { _id: id, ...rest };
}

export class DrizzleCalendarRepository implements ICalendarRepository {
  constructor(private db: DrizzleDb) {}

  async get(): Promise<CalendarInterface> {
    const existing = await this.db.query.calendars.findFirst();
    if (existing) {
      return toCalendar(existing);
    }

    const [created] = await this.db
      .insert(calendars)
      .values({ CurrentDay: 0, CurrentDate: new Date(), updatedAt: new Date() })
      .returning();

    return toCalendar(created);
  }

  async update(data: Partial<CalendarInterface>): Promise<CalendarInterface> {
    const { _id } = await this.get();

    const [updated] = await this.db
      .update(calendars)
      .set({ ...(data as Partial<typeof calendars.$inferInsert>), updatedAt: new Date() })
      .where(eq(calendars.id, _id as string))
      .returning();

    return toCalendar(updated);
  }
}
