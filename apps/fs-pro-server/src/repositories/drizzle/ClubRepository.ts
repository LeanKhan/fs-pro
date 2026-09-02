import { and, eq, inArray, isNull } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { ClubInterface } from '../../controllers/clubs/club.model';
import * as schema from '../../db/drizzle/full-schema';
import { clubs, places, players, managers } from '../../db/drizzle/schema';
import { IClubRepository, IClubFilter, IClubReadOptions } from '../ClubRepository';

type DrizzleDb = PostgresJsDatabase<typeof schema>;
type ClubRow = typeof clubs.$inferSelect;
type PlaceRow = typeof places.$inferSelect;
type PlayerRow = typeof players.$inferSelect;
type ManagerRow = typeof managers.$inferSelect;

function remapId<T extends { id: string; mongoId: string | null }>(row: T) {
  const { id, mongoId, ...rest } = row;
  return { _id: id, ...rest };
}

/** Same `id` -> `_id` remap DrizzlePlaceRepository/DrizzleManagerRepository
 * do, for the same reason. `Address.Country` gets the same nested-object
 * treatment DrizzleManagerRepository gives Nationality - club.model.ts's
 * hook always populates it as a full Place object, not a bare id, so it's
 * merged back into `Address` here rather than left as the separate
 * `AddressCountry` FK column Postgres actually stores it in.
 *
 * `Players`/`Manager` (only present when `options.withPlayersAndManager`
 * was passed) get the same id remap but deliberately do NOT nest their own
 * `Nationality` the way `DrizzlePlayerRepository`/`DrizzleManagerRepository`
 * do on their own direct reads - Mongoose's populate does re-trigger those
 * models' own `pre('find')` hooks, so the raw path's `.populate('Players
 * Manager')` technically nests it one level deeper than this does. Minor,
 * deliberate simplification: this is `GET /clubs/all`, not on any critical
 * path, and Nationality still comes back as a bare id rather than being
 * silently dropped. */
function toClub(
  row: ClubRow & {
    addressCountry?: PlaceRow | null;
    players?: PlayerRow[];
    manager?: ManagerRow | null;
  }
): ClubInterface {
  const { id, mongoId, addressCountry, Address, players: playerRows, manager, ...rest } = row;

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
    ...(playerRows !== undefined ? { Players: playerRows.map(remapId) } : {}),
    ...(manager !== undefined ? { Manager: manager ? remapId(manager) : rest.Manager } : {}),
  } as unknown as ClubInterface;
}

export class DrizzleClubRepository implements IClubRepository {
  constructor(private db: DrizzleDb) {}

  async findById(id: string, options: IClubReadOptions = {}): Promise<ClubInterface | null> {
    const club = await this.db.query.clubs.findFirst({
      where: eq(clubs.id, id),
      with: {
        addressCountry: true,
        ...(options.withPlayersAndManager ? { players: true, manager: true } : {}),
      },
    });
    return club ? toClub(club) : null;
  }

  async findAll(filter: IClubFilter = {}, options: IClubReadOptions = {}): Promise<ClubInterface[]> {
    const conditions = [];
    if (filter.User !== undefined) conditions.push(eq(clubs.User, filter.User));
    if (filter.unclaimed) conditions.push(isNull(clubs.User));
    if (filter.League !== undefined) conditions.push(eq(clubs.League, filter.League));
    if (filter.ids !== undefined) conditions.push(inArray(clubs.id, filter.ids));

    const rows = await this.db.query.clubs.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      with: {
        addressCountry: true,
        ...(options.withPlayersAndManager ? { players: true, manager: true } : {}),
      },
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

  async createMany(data: Partial<ClubInterface>[]): Promise<ClubInterface[]> {
    if (data.length === 0) return [];
    const rows = await this.db
      .insert(clubs)
      .values(data.map((d) => ({ ...(d as typeof clubs.$inferInsert), updatedAt: new Date() })))
      .returning();

    return rows.map(toClub);
  }

  async update(id: string, data: Partial<ClubInterface>): Promise<ClubInterface | null> {
    const [club] = await this.db
      .update(clubs)
      .set({ ...(data as Partial<typeof clubs.$inferInsert>), updatedAt: new Date() })
      .where(eq(clubs.id, id))
      .returning();

    return club ? toClub(club) : null;
  }

  async delete(id: string): Promise<ClubInterface> {
    const [club] = await this.db.delete(clubs).where(eq(clubs.id, id)).returning();
    if (!club) {
      throw new Error(`Club [${id}] does not exist`);
    }
    return toClub(club);
  }
}
