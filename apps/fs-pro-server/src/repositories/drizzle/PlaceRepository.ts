import { eq } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { IPlace } from '../../controllers/places/places.model';
import * as schema from '../../db/drizzle/full-schema';
import { places } from '../../db/drizzle/schema';
import { IPlaceRepository } from '../PlaceRepository';

type DrizzleDb = PostgresJsDatabase<typeof schema>;

export class DrizzlePlaceRepository implements IPlaceRepository {
  constructor(private db: DrizzleDb) {}

  async findById(id: string): Promise<IPlace | null> {
    const [place] = await this.db
      .select()
      .from(places)
      .where(eq(places.id, id))
      .limit(1);

    return (place as unknown as IPlace) || null;
  }

  async findAll(): Promise<IPlace[]> {
    const rows = await this.db.select().from(places);
    return rows as unknown as IPlace[];
  }

  async create(data: Partial<IPlace>): Promise<IPlace> {
    const [place] = await this.db
      .insert(places)
      .values({ ...(data as typeof places.$inferInsert), updatedAt: new Date() })
      .returning();

    return place as unknown as IPlace;
  }

  async update(id: string, data: Partial<IPlace>): Promise<IPlace> {
    const [place] = await this.db
      .update(places)
      .set({ ...(data as Partial<typeof places.$inferInsert>), updatedAt: new Date() })
      .where(eq(places.id, id))
      .returning();

    return place as unknown as IPlace;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(places).where(eq(places.id, id));
  }
}
