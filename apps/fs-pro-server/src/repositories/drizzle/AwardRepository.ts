import { eq } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { AwardInterface } from '../../controllers/awards/awards.model';
import * as schema from '../../db/drizzle/full-schema';
import { awards } from '../../db/drizzle/schema';
import { IAwardRepository, IAwardFilter } from '../AwardRepository';

type DrizzleDb = PostgresJsDatabase<typeof schema>;
type AwardRow = typeof awards.$inferSelect;

function toAward(row: AwardRow): AwardInterface {
  const { id, mongoId, ...rest } = row;
  return { _id: id, ...rest } as unknown as AwardInterface;
}

export class DrizzleAwardRepository implements IAwardRepository {
  constructor(private db: DrizzleDb) {}

  async findAll(filter: IAwardFilter = {}): Promise<AwardInterface[]> {
    const rows = await this.db.query.awards.findMany({
      where:
        filter.Season !== undefined
          ? eq(awards.Season, filter.Season)
          : undefined,
    });
    return rows.map(toAward);
  }

  async createMany(data: Partial<AwardInterface>[]): Promise<AwardInterface[]> {
    if (data.length === 0) return [];
    const rows = await this.db
      .insert(awards)
      .values(
        data.map((d) => ({
          ...(d as typeof awards.$inferInsert),
          updatedAt: new Date(),
        }))
      )
      .returning();

    return rows.map(toAward);
  }
}
