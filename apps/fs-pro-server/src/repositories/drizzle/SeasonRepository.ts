import { and, eq } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { SeasonInterface } from '../../controllers/seasons/season.model';
import * as schema from '../../db/drizzle/full-schema';
import { seasons, fixtures } from '../../db/drizzle/schema';
import { ISeasonRepository, ISeasonFilter } from '../SeasonRepository';

type DrizzleDb = PostgresJsDatabase<typeof schema>;
type SeasonRow = typeof seasons.$inferSelect;
type FixtureRow = typeof fixtures.$inferSelect;

/** Same `id` -> `_id` remap every other Drizzle repository does, applied to
 * the season itself and to each populated Fixture. */
function toSeason(
  row: SeasonRow & { fixtures?: FixtureRow[] }
): SeasonInterface {
  const { id, fixtures: fixtureRows, ...rest } = row;

  return {
    _id: id,
    ...rest,
    ...(fixtureRows !== undefined
      ? {
          Fixtures: fixtureRows.map((f) => {
            const {
              id: fixtureId,
              mongoId: fixtureMongoId,
              ...fixtureRest
            } = f;
            return { _id: fixtureId, ...fixtureRest };
          }),
        }
      : {}),
  } as unknown as SeasonInterface;
}

export class DrizzleSeasonRepository implements ISeasonRepository {
  constructor(private db: DrizzleDb) {}

  async findById(id: string): Promise<SeasonInterface | null> {
    const season = await this.db.query.seasons.findFirst({
      where: eq(seasons.id, id),
      with: { fixtures: true },
    });
    return season ? toSeason(season) : null;
  }

  async findAll(filter: ISeasonFilter = {}): Promise<SeasonInterface[]> {
    const conditions = [];
    if (filter.Competition !== undefined)
      conditions.push(eq(seasons.Competition, filter.Competition));
    if (filter.Year !== undefined)
      conditions.push(eq(seasons.Year, filter.Year));
    if (filter.SeasonCode !== undefined)
      conditions.push(eq(seasons.SeasonCode, filter.SeasonCode));

    const rows = await this.db.query.seasons.findMany({
      where: conditions.length ? and(...conditions) : undefined,
    });
    return rows.map(toSeason);
  }

  async create(data: Partial<SeasonInterface>): Promise<SeasonInterface> {
    const [season] = await this.db
      .insert(seasons)
      .values({
        ...(data as typeof seasons.$inferInsert),
        updatedAt: new Date(),
      })
      .returning();

    return toSeason(season);
  }

  async update(
    id: string,
    data: Partial<SeasonInterface>
  ): Promise<SeasonInterface | null> {
    const [season] = await this.db
      .update(seasons)
      .set({
        ...(data as Partial<typeof seasons.$inferInsert>),
        updatedAt: new Date(),
      })
      .where(eq(seasons.id, id))
      .returning();

    return season ? toSeason(season) : null;
  }

  async delete(id: string): Promise<SeasonInterface> {
    const [season] = await this.db
      .delete(seasons)
      .where(eq(seasons.id, id))
      .returning();
    if (!season) {
      throw new Error(`Season [${id}] does not exist`);
    }
    return toSeason(season);
  }
}
