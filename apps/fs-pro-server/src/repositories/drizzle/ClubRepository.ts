import { and, eq } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { ClubInterface } from '../../controllers/clubs/club.model';
import * as schema from '../../db/drizzle/full-schema';
import { clubs, places } from '../../db/drizzle/schema';
import { IClubRepository, IClubFilter } from '../ClubRepository';

type DrizzleDb = PostgresJsDatabase<typeof schema>;
type ClubRow = typeof clubs.$inferSelect;
type PlaceRow = typeof places.$inferSelect;

/** Same `id` -> `_id` remap DrizzlePlaceRepository/DrizzleManagerRepository
 * do, for the same reason. `Address.Country` gets the same nested-object
 * treatment DrizzleManagerRepository gives Nationality - club.model.ts's
 * hook always populates it as a full Place object, not a bare id, so it's
 * merged back into `Address` here rather than left as the separate
 * `AddressCountry` FK column Postgres actually stores it in. */
function toClub(row: ClubRow & { addressCountry?: PlaceRow | null }): ClubInterface {
  const { id, mongoId, addressCountry, Address, ...rest } = row;

  const country = addressCountry
    ? (() => {
        const { id: placeId, mongoId: placeMongoId, ...placeRest } = addressCountry;
        return { _id: placeId, ...placeRest };
      })()
    : undefined;

  return {
    _id: id,
    ...rest,
    Address: { ...(Address as Record<string, unknown> | null), Country: country },
  } as unknown as ClubInterface;
}

export class DrizzleClubRepository implements IClubRepository {
  constructor(private db: DrizzleDb) {}

  async findById(id: string): Promise<ClubInterface | null> {
    const club = await this.db.query.clubs.findFirst({
      where: eq(clubs.id, id),
      with: { addressCountry: true },
    });
    return club ? toClub(club) : null;
  }

  async findAll(filter: IClubFilter = {}): Promise<ClubInterface[]> {
    const conditions = [];
    if (filter.User !== undefined) conditions.push(eq(clubs.User, filter.User));
    if (filter.League !== undefined) conditions.push(eq(clubs.League, filter.League));

    const rows = await this.db.query.clubs.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      with: { addressCountry: true },
    });
    return rows.map(toClub);
  }

  async create(data: Partial<ClubInterface>): Promise<ClubInterface> {
    const [club] = await this.db
      .insert(clubs)
      .values({ ...(data as typeof clubs.$inferInsert), updatedAt: new Date() })
      .returning();

    return toClub(club);
  }

  async update(id: string, data: Partial<ClubInterface>): Promise<ClubInterface | null> {
    const [club] = await this.db
      .update(clubs)
      .set({ ...(data as Partial<typeof clubs.$inferInsert>), updatedAt: new Date() })
      .where(eq(clubs.id, id))
      .returning();

    return club ? toClub(club) : null;
  }
}
