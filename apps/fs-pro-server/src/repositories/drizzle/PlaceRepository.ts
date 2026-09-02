import { and, eq, or } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { IPlace } from '../../controllers/places/places.model';
import * as schema from '../../db/drizzle/full-schema';
import { places } from '../../db/drizzle/schema';
import { IPlaceRepository, IPlaceFilter } from '../PlaceRepository';

type DrizzleDb = PostgresJsDatabase<typeof schema>;
type PlaceRow = typeof places.$inferSelect;

/**
 * Drizzle's column key is `id` (the JS property name in schema.ts), but the
 * public `IPlace` shape - and every Mongo-backed response - uses `_id`, the
 * name every existing client already reads. `mongoId` is a migration-only
 * bookkeeping field, not part of the public shape, so it's dropped here too.
 */
function toPlace(row: PlaceRow): IPlace {
  const { id, mongoId, ...rest } = row;
  return { _id: id, ...rest } as unknown as IPlace;
}

export class DrizzlePlaceRepository implements IPlaceRepository {
  constructor(private db: DrizzleDb) {}

  async findById(id: string): Promise<IPlace | null> {
    const [place] = await this.db
      .select()
      .from(places)
      .where(eq(places.id, id))
      .limit(1);

    return place ? toPlace(place) : null;
  }

  async findAll(filter: IPlaceFilter = {}): Promise<IPlace[]> {
    const conditions = [
      filter.Type !== undefined ? eq(places.Type, filter.Type) : undefined,
      filter.Code !== undefined ? eq(places.Code, filter.Code) : undefined,
      filter.Name !== undefined ? eq(places.Name, filter.Name) : undefined,
      filter.Region !== undefined
        ? eq(places.Region, filter.Region)
        : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);

    const rows = await (conditions.length
      ? this.db
          .select()
          .from(places)
          .where(and(...conditions))
      : this.db.select().from(places));

    return rows.map(toPlace);
  }

  async findByNameOrCode(value: string): Promise<IPlace | null> {
    const [place] = await this.db
      .select()
      .from(places)
      .where(or(eq(places.Name, value), eq(places.Code, value)))
      .limit(1);

    return place ? toPlace(place) : null;
  }

  async create(data: Partial<IPlace>): Promise<IPlace> {
    const [place] = await this.db
      .insert(places)
      .values({
        ...(data as typeof places.$inferInsert),
        updatedAt: new Date(),
      })
      .returning();

    return toPlace(place);
  }

  async update(id: string, data: Partial<IPlace>): Promise<IPlace> {
    const [place] = await this.db
      .update(places)
      .set({
        ...(data as Partial<typeof places.$inferInsert>),
        updatedAt: new Date(),
      })
      .where(eq(places.id, id))
      .returning();

    return toPlace(place);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(places).where(eq(places.id, id));
  }
}
