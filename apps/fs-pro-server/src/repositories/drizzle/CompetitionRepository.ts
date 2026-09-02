import { and, eq } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { CompetitionInterface } from '../../controllers/competitions/competition.model';
import * as schema from '../../db/drizzle/full-schema';
import { competitions, places } from '../../db/drizzle/schema';
import {
  ICompetitionRepository,
  ICompetitionFilter,
} from '../CompetitionRepository';

type DrizzleDb = PostgresJsDatabase<typeof schema>;
type CompetitionRow = typeof competitions.$inferSelect;
type PlaceRow = typeof places.$inferSelect;

/** Same `id` -> `_id` remap DrizzlePlaceRepository/DrizzleClubRepository do.
 * Country gets the same nested-object treatment Manager's Nationality and
 * Club's Address.Country get - competition.model.ts's hook always populates
 * it as a full Place object, not a bare id, and here it's a top-level field
 * (not nested under anything, unlike Club's Address.Country). */
function toCompetition(
  row: CompetitionRow & { country?: PlaceRow | null }
): CompetitionInterface {
  const { id, mongoId, country, ...rest } = row;

  return {
    _id: id,
    ...rest,
    Country: country
      ? (() => {
          const { id: placeId, mongoId: placeMongoId, ...placeRest } = country;
          return { _id: placeId, ...placeRest };
        })()
      : rest.Country,
  } as unknown as CompetitionInterface;
}

export class DrizzleCompetitionRepository implements ICompetitionRepository {
  constructor(private db: DrizzleDb) {}

  async findById(id: string): Promise<CompetitionInterface | null> {
    const competition = await this.db.query.competitions.findFirst({
      where: eq(competitions.id, id),
      with: { country: true },
    });
    return competition ? toCompetition(competition) : null;
  }

  async findAll(
    filter: ICompetitionFilter = {}
  ): Promise<CompetitionInterface[]> {
    const conditions = [];
    if (filter.Type !== undefined)
      conditions.push(eq(competitions.Type, filter.Type));
    if (filter.Division !== undefined)
      conditions.push(eq(competitions.Division, filter.Division));
    if (filter.Country !== undefined)
      conditions.push(eq(competitions.Country, filter.Country));

    const rows = await this.db.query.competitions.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      with: { country: true },
    });
    return rows.map(toCompetition);
  }

  async create(
    data: Partial<CompetitionInterface>
  ): Promise<CompetitionInterface> {
    const [competition] = await this.db
      .insert(competitions)
      .values({
        ...(data as typeof competitions.$inferInsert),
        updatedAt: new Date(),
      })
      .returning();

    return toCompetition(competition);
  }

  async update(
    id: string,
    data: Partial<CompetitionInterface>
  ): Promise<CompetitionInterface | null> {
    const [competition] = await this.db
      .update(competitions)
      .set({
        ...(data as Partial<typeof competitions.$inferInsert>),
        updatedAt: new Date(),
      })
      .where(eq(competitions.id, id))
      .returning();

    return competition ? toCompetition(competition) : null;
  }

  async delete(id: string): Promise<CompetitionInterface> {
    const [competition] = await this.db
      .delete(competitions)
      .where(eq(competitions.id, id))
      .returning();
    if (!competition) {
      throw new Error(`Competition [${id}] does not exist`);
    }
    return toCompetition(competition);
  }
}
