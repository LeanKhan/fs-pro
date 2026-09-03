import { and, eq, inArray, isNull } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { ClubInterface } from '../../controllers/clubs/club.model';
import * as schema from '../../db/drizzle/full-schema';
import { clubs, places, players, managers } from '../../db/drizzle/schema';
import {
  IClubRepository,
  IClubFilter,
  IClubReadOptions,
} from '../ClubRepository';

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
 * do, for the same reason. `ManagerId`/`Players` (only present when
 * `options.withPlayersAndManager` was passed) and `AddressCountryId`
 * (always fetched) all follow the same invariant every repository in this
 * codebase now does: the `Id`-suffixed field always passes straight
 * through as a bare id via `...rest`, and the clean, un-suffixed name
 * (`Manager`, `Players`, `AddressCountry`) is only ever added - never set
 * to a bare id - when the relation was actually fetched.
 *
 * `Players`/`Manager` deliberately do NOT nest their own further relations
 * (Mongoose's populate technically nested one level deeper via each
 * model's own `pre('find')` hooks) - minor, deliberate simplification:
 * this is `GET /clubs/all`, not on any critical path. */
function toClub(
  row: ClubRow & {
    addressCountry?: PlaceRow | null;
    players?: PlayerRow[];
    manager?: ManagerRow | null;
  }
): ClubInterface {
  const { id, mongoId, addressCountry, players: playerRows, manager, ...rest } =
    row;

  return {
    _id: id,
    ...rest,
    ...(addressCountry
      ? { AddressCountry: remapId(addressCountry) }
      : {}),
    ...(playerRows !== undefined ? { Players: playerRows.map(remapId) } : {}),
    ...(manager !== undefined && manager ? { Manager: remapId(manager) } : {}),
  } as unknown as ClubInterface;
}

export class DrizzleClubRepository implements IClubRepository {
  constructor(private db: DrizzleDb) {}

  async findById(
    id: string,
    options: IClubReadOptions = {}
  ): Promise<ClubInterface | null> {
    const club = await this.db.query.clubs.findFirst({
      where: eq(clubs.id, id),
      with: {
        addressCountry: true,
        ...(options.withPlayersAndManager
          ? { players: true, manager: true }
          : {}),
      },
    });
    return club ? toClub(club) : null;
  }

  async findAll(
    filter: IClubFilter = {},
    options: IClubReadOptions = {}
  ): Promise<ClubInterface[]> {
    const conditions = [];
    if (filter.UserId !== undefined)
      conditions.push(eq(clubs.UserId, filter.UserId));
    if (filter.unclaimed) conditions.push(isNull(clubs.UserId));
    if (filter.LeagueId !== undefined)
      conditions.push(eq(clubs.LeagueId, filter.LeagueId));
    if (filter.ids !== undefined)
      conditions.push(inArray(clubs.id, filter.ids));

    const rows = await this.db.query.clubs.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      with: {
        addressCountry: true,
        ...(options.withPlayersAndManager
          ? { players: true, manager: true }
          : {}),
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
      .values(
        data.map((d) => ({
          ...(d as typeof clubs.$inferInsert),
          updatedAt: new Date(),
        }))
      )
      .returning();

    return rows.map(toClub);
  }

  async update(
    id: string,
    data: Partial<ClubInterface>
  ): Promise<ClubInterface | null> {
    const [club] = await this.db
      .update(clubs)
      .set({
        ...(data as Partial<typeof clubs.$inferInsert>),
        updatedAt: new Date(),
      })
      .where(eq(clubs.id, id))
      .returning();

    return club ? toClub(club) : null;
  }

  async delete(id: string): Promise<ClubInterface> {
    const [club] = await this.db
      .delete(clubs)
      .where(eq(clubs.id, id))
      .returning();
    if (!club) {
      throw new Error(`Club [${id}] does not exist`);
    }
    return toClub(club);
  }
}
