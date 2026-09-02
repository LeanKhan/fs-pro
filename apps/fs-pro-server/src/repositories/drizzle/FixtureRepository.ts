import { and, eq, inArray } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { Fixture as FixtureInterface } from '../../controllers/fixtures/fixture.model';
import * as schema from '../../db/drizzle/full-schema';
import { fixtures, clubMatchDetails, playerMatchDetails } from '../../db/drizzle/schema';
import { IFixtureRepository, IFixtureFilter } from '../FixtureRepository';

type DrizzleDb = PostgresJsDatabase<typeof schema>;
type FixtureRow = typeof fixtures.$inferSelect;
type ClubMatchDetailsRow = typeof clubMatchDetails.$inferSelect;
type PlayerMatchDetailsRow = typeof playerMatchDetails.$inferSelect;

/** `id` -> `_id` remap, applied at every nesting level (fixture, each side's
 * ClubMatchDetails, each PlayerStats entry) - same reason every other
 * Drizzle repository does this. */
function remapId<T extends { id: string; mongoId: string | null }>(row: T) {
  const { id, mongoId, ...rest } = row;
  return { _id: id, ...rest };
}

function toSideDetails(row: (ClubMatchDetailsRow & { playerStats?: PlayerMatchDetailsRow[] }) | null) {
  if (!row) return undefined;
  const { playerStats, ...rest } = row;
  return {
    ...remapId(rest),
    PlayerStats: (playerStats ?? []).map(remapId),
  };
}

/** Same `id` -> `_id` remap every other Drizzle repository does. Replicates
 * `fixture.service.ts`'s always-on `HomeSideDetails`/`AwaySideDetails`
 * populate (each with `PlayerStats`) - see IFixtureRepository's doc
 * comment for why that's the baseline shape, not an opt-in. */
function toFixture(
  row: FixtureRow & {
    homeSideDetails?: (ClubMatchDetailsRow & { playerStats?: PlayerMatchDetailsRow[] }) | null;
    awaySideDetails?: (ClubMatchDetailsRow & { playerStats?: PlayerMatchDetailsRow[] }) | null;
  }
): FixtureInterface {
  const { id, mongoId, homeSideDetails, awaySideDetails, ...rest } = row;

  return {
    _id: id,
    ...rest,
    HomeSideDetails: toSideDetails(homeSideDetails ?? null) ?? rest.HomeSideDetails,
    AwaySideDetails: toSideDetails(awaySideDetails ?? null) ?? rest.AwaySideDetails,
  } as unknown as FixtureInterface;
}

export class DrizzleFixtureRepository implements IFixtureRepository {
  constructor(private db: DrizzleDb) {}

  async findById(id: string): Promise<FixtureInterface | null> {
    const fixture = await this.db.query.fixtures.findFirst({
      where: eq(fixtures.id, id),
      with: {
        homeSideDetails: { with: { playerStats: true } },
        awaySideDetails: { with: { playerStats: true } },
      },
    });
    return fixture ? toFixture(fixture) : null;
  }

  async findAll(filter: IFixtureFilter = {}): Promise<FixtureInterface[]> {
    const conditions = [];
    if (filter.Season !== undefined) conditions.push(eq(fixtures.Season, filter.Season));
    if (filter.Played !== undefined) conditions.push(eq(fixtures.Played, filter.Played));
    if (filter.ids !== undefined) conditions.push(inArray(fixtures.id, filter.ids));

    const rows = await this.db.query.fixtures.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      with: {
        homeSideDetails: { with: { playerStats: true } },
        awaySideDetails: { with: { playerStats: true } },
      },
    });
    return rows.map(toFixture);
  }

  async create(data: Partial<FixtureInterface>): Promise<FixtureInterface> {
    const [fixture] = await this.db
      .insert(fixtures)
      .values({ ...(data as typeof fixtures.$inferInsert), updatedAt: new Date() })
      .returning();

    return toFixture(fixture);
  }

  async createMany(data: Partial<FixtureInterface>[]): Promise<FixtureInterface[]> {
    if (data.length === 0) return [];
    const rows = await this.db
      .insert(fixtures)
      .values(data.map((d) => ({ ...(d as typeof fixtures.$inferInsert), updatedAt: new Date() })))
      .returning();

    return rows.map((row) => toFixture(row));
  }

  async update(id: string, data: Partial<FixtureInterface>): Promise<FixtureInterface | null> {
    const [fixture] = await this.db
      .update(fixtures)
      .set({ ...(data as Partial<typeof fixtures.$inferInsert>), updatedAt: new Date() })
      .where(eq(fixtures.id, id))
      .returning();

    return fixture ? toFixture(fixture) : null;
  }

  async delete(id: string): Promise<FixtureInterface> {
    const [fixture] = await this.db.delete(fixtures).where(eq(fixtures.id, id)).returning();
    if (!fixture) {
      throw new Error(`Fixture [${id}] does not exist`);
    }
    return toFixture(fixture);
  }
}
