import { eq } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DayInterface } from '../../controllers/days/day.model';
import * as schema from '../../db/drizzle/full-schema';
import { days } from '../../db/drizzle/schema';
import { IDayRepository } from '../DayRepository';

type DrizzleDb = PostgresJsDatabase<typeof schema>;
type DayRow = typeof days.$inferSelect;

/** Same `id` -> `_id` remap every other Drizzle repository does. `Matches`
 * comes back as bare Fixture ids, same as it's stored - the populate merge
 * happens in `day.service.ts`, not here. */
function toDay(row: DayRow): DayInterface {
  const { id, mongoId, ...rest } = row;
  return { _id: id, ...rest } as unknown as DayInterface;
}

export class DrizzleDayRepository implements IDayRepository {
  constructor(private db: DrizzleDb) {}

  async findById(id: string): Promise<DayInterface | null> {
    const day = await this.db.query.days.findFirst({ where: eq(days.id, id) });
    return day ? toDay(day) : null;
  }

  async create(data: Partial<DayInterface>): Promise<DayInterface> {
    const [day] = await this.db
      .insert(days)
      .values({ ...(data as typeof days.$inferInsert), updatedAt: new Date() })
      .returning();

    return toDay(day);
  }

  async createMany(data: Partial<DayInterface>[]): Promise<DayInterface[]> {
    if (data.length === 0) return [];
    const rows = await this.db
      .insert(days)
      .values(data.map((d) => ({ ...(d as typeof days.$inferInsert), updatedAt: new Date() })))
      .returning();

    return rows.map(toDay);
  }

  async update(id: string, data: Partial<DayInterface>): Promise<DayInterface | null> {
    const [day] = await this.db
      .update(days)
      .set({ ...(data as Partial<typeof days.$inferInsert>), updatedAt: new Date() })
      .where(eq(days.id, id))
      .returning();

    return day ? toDay(day) : null;
  }

  async delete(id: string): Promise<DayInterface> {
    const [day] = await this.db.delete(days).where(eq(days.id, id)).returning();
    if (!day) {
      throw new Error(`Day [${id}] does not exist`);
    }
    return toDay(day);
  }
}
