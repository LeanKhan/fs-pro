import { and, eq } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { ManagerInterface } from '../../controllers/managers/manager.model';
import * as schema from '../../db/drizzle/full-schema';
import { managers, places, clubs } from '../../db/drizzle/schema';
import {
  IManagerRepository,
  IManagerFilter,
  IManagerReadOptions,
} from '../ManagerRepository';

type DrizzleDb = PostgresJsDatabase<typeof schema>;
type ManagerRow = typeof managers.$inferSelect;
type PlaceRow = typeof places.$inferSelect;
type ClubRow = typeof clubs.$inferSelect;

/** Same `id` -> `_id` remap DrizzlePlaceRepository does, for the same
 * reason - every Mongo-backed response (and this file's own nested
 * Nationality/Club objects, see below) uses `_id`, not Drizzle's `id`
 * column-key. */
function toManager(
  row: ManagerRow & { nationality?: PlaceRow | null; club?: ClubRow | null }
): ManagerInterface {
  const { id, mongoId, nationality, club, ...rest } = row;

  return {
    _id: id,
    ...rest,
    // manager.model.ts's pre('find')/pre('findOne') hook always populates
    // Nationality on the Mongo side (a full Place object, not a bare id) -
    // matched here via the `nationality` relation from relations.ts, with
    // the same id/mongoId remap applied to the nested object too.
    Nationality: nationality
      ? (() => {
          const {
            id: placeId,
            mongoId: placeMongoId,
            ...placeRest
          } = nationality;
          return { _id: placeId, ...placeRest };
        })()
      : rest.Nationality,
    // Only present when `options.withClub` was passed - mirrors the
    // `.populate('Club', 'Name ClubCode LeagueCode')` projection the raw
    // Mongo path used, so it's a narrower object than a full Club record.
    ...(club !== undefined
      ? {
          Club: club
            ? {
                _id: club.id,
                Name: club.Name,
                ClubCode: club.ClubCode,
                LeagueCode: club.LeagueCode,
              }
            : rest.Club,
        }
      : {}),
  } as unknown as ManagerInterface;
}

export class DrizzleManagerRepository implements IManagerRepository {
  constructor(private db: DrizzleDb) {}

  async findById(
    id: string,
    options: IManagerReadOptions = {}
  ): Promise<ManagerInterface | null> {
    const manager = await this.db.query.managers.findFirst({
      where: eq(managers.id, id),
      with: { nationality: true, ...(options.withClub ? { club: true } : {}) },
    });
    return manager ? toManager(manager) : null;
  }

  async findAll(
    filter: IManagerFilter = {},
    options: IManagerReadOptions = {}
  ): Promise<ManagerInterface[]> {
    const conditions = [];
    if (filter.isEmployed !== undefined)
      conditions.push(eq(managers.isEmployed, filter.isEmployed));
    if (filter.Club !== undefined)
      conditions.push(eq(managers.Club, filter.Club));

    const rows = await this.db.query.managers.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      with: { nationality: true, ...(options.withClub ? { club: true } : {}) },
    });
    return rows.map(toManager);
  }

  async create(data: Partial<ManagerInterface>): Promise<ManagerInterface> {
    const [manager] = await this.db
      .insert(managers)
      .values({
        ...(data as typeof managers.$inferInsert),
        updatedAt: new Date(),
      })
      .returning();

    return toManager(manager);
  }

  async update(
    id: string,
    data: Partial<ManagerInterface>
  ): Promise<ManagerInterface | null> {
    const [manager] = await this.db
      .update(managers)
      .set({
        ...(data as Partial<typeof managers.$inferInsert>),
        updatedAt: new Date(),
      })
      .where(eq(managers.id, id))
      .returning();

    return manager ? toManager(manager) : null;
  }

  async delete(id: string): Promise<ManagerInterface> {
    const [manager] = await this.db
      .delete(managers)
      .where(eq(managers.id, id))
      .returning();
    if (!manager) {
      throw new Error(`Manager [${id}] does not exist`);
    }
    return toManager(manager);
  }
}
