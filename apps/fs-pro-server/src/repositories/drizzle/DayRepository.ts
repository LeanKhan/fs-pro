import { and, eq, gte, lte } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DayInterface } from '../../controllers/days/day.model';
import * as schema from '../../db/drizzle/full-schema';
import { days } from '../../db/drizzle/schema';
import { IDayRepository, IDayFilter } from '../DayRepository';

type DrizzleDb = PostgresJsDatabase<typeof schema>;
type DayRow = typeof days.$inferSelect;

function toDay(row: DayRow): DayInterface {
  const { id, ...rest } = row;
  return { _id: id, ...rest };
}

export class DrizzleDayRepository implements IDayRepository {
  constructor(private db: DrizzleDb) {}

  async findById(id: string): Promise<DayInterface | null> {
    const day = await this.db.query.days.findFirst({ where: eq(days.id, id) });
    return day ? toDay(day) : null;
  }

  async findAll(filter: IDayFilter = {}): Promise<DayInterface[]> {
    const conditions = [];
    if (filter.indexFrom !== undefined)
      conditions.push(gte(days.Index, filter.indexFrom));
    if (filter.indexTo !== undefined)
      conditions.push(lte(days.Index, filter.indexTo));

    const rows = await this.db.query.days.findMany({
      where: conditions.length ? and(...conditions) : undefined,
    });
    return rows.map(toDay);
  }

  async create(data: Partial<DayInterface>): Promise<DayInterface> {
    const [day] = await this.db
      .insert(days)
      .values({ ...(data as typeof days.$inferInsert), updatedAt: new Date() })
      .returning();

    return toDay(day);
  }

  async update(
    id: string,
    data: Partial<DayInterface>
  ): Promise<DayInterface | null> {
    const [day] = await this.db
      .update(days)
      .set({
        ...(data as Partial<typeof days.$inferInsert>),
        updatedAt: new Date(),
      })
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
