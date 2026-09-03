import { and, eq, inArray } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { PlayerInterface } from '../../controllers/players/player.model';
import * as schema from '../../db/drizzle/full-schema';
import { players, places, playerMatchDetails } from '../../db/drizzle/schema';
import {
  IPlayerRepository,
  IPlayerFilter,
  IPlayerReadOptions,
} from '../PlayerRepository';

type DrizzleDb = PostgresJsDatabase<typeof schema>;
type PlayerRow = typeof players.$inferSelect;
type PlaceRow = typeof places.$inferSelect;

/** Same `id` -> `_id` remap DrizzlePlaceRepository/DrizzleManagerRepository
 * do - `NationalityId` always passes through as a bare id via `...rest`;
 * `Nationality` (the clean name) is only added - never set to a bare id -
 * when `options.withNationality` was passed. */
function toPlayer(
  row: PlayerRow & { nationality?: PlaceRow | null }
): PlayerInterface {
  const { id, mongoId, nationality, ...rest } = row;

  return {
    _id: id,
    ...rest,
    ...(nationality
      ? {
          Nationality: (() => {
            const {
              id: placeId,
              mongoId: placeMongoId,
              ...placeRest
            } = nationality;
            return { _id: placeId, ...placeRest };
          })(),
        }
      : {}),
  } as unknown as PlayerInterface;
}

export class DrizzlePlayerRepository implements IPlayerRepository {
  constructor(private db: DrizzleDb) {}

  async findById(
    id: string,
    options: IPlayerReadOptions = {}
  ): Promise<PlayerInterface | null> {
    const player = await this.db.query.players.findFirst({
      where: eq(players.id, id),
      with: options.withNationality ? { nationality: true } : {},
    });
    return player ? toPlayer(player) : null;
  }

  async findAll(
    filter: IPlayerFilter = {},
    options: IPlayerReadOptions = {}
  ): Promise<PlayerInterface[]> {
    const conditions = [];
    if (filter.ClubId !== undefined)
      conditions.push(eq(players.ClubId, filter.ClubId));
    if (filter.ClubCode !== undefined)
      conditions.push(eq(players.ClubCode, filter.ClubCode));
    if (filter.isSigned !== undefined)
      conditions.push(eq(players.isSigned, filter.isSigned));

    const rows = await this.db.query.players.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      with: options.withNationality ? { nationality: true } : {},
    });
    return rows.map(toPlayer);
  }

  async create(data: Partial<PlayerInterface>): Promise<PlayerInterface> {
    const [player] = await this.db
      .insert(players)
      .values({
        ...(data as typeof players.$inferInsert),
        updatedAt: new Date(),
      })
      .returning();

    return toPlayer(player);
  }

  async update(
    id: string,
    data: Partial<PlayerInterface>
  ): Promise<PlayerInterface | null> {
    const [player] = await this.db
      .update(players)
      .set({
        ...(data as Partial<typeof players.$inferInsert>),
        updatedAt: new Date(),
      })
      .where(eq(players.id, id))
      .returning();

    return player ? toPlayer(player) : null;
  }

  async updateManyByIds(
    ids: string[],
    data: Partial<PlayerInterface>
  ): Promise<void> {
    if (!ids.length) return;
    await this.db
      .update(players)
      .set({
        ...(data as Partial<typeof players.$inferInsert>),
        updatedAt: new Date(),
      })
      .where(inArray(players.id, ids));
  }

  async delete(id: string): Promise<PlayerInterface> {
    // No ON DELETE CASCADE on playerMatchDetails.Player - delete this
    // player's match-stat history first, matching the Mongo hook's
    // `PlayerMatch.deleteMany({ Player: this._id })` half of the cascade.
    await this.db
      .delete(playerMatchDetails)
      .where(eq(playerMatchDetails.PlayerId, id));

    const [player] = await this.db
      .delete(players)
      .where(eq(players.id, id))
      .returning();
    if (!player) {
      throw new Error(`Player [${id}] does not exist`);
    }
    return toPlayer(player);
  }
}
