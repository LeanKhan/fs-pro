import { eq } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { PlayerMatchDetailsInterface } from '../../controllers/player-match/player-match.model';
import * as schema from '../../db/drizzle/full-schema';
import { playerMatchDetails } from '../../db/drizzle/schema';
import { IPlayerMatchRepository } from '../PlayerMatchRepository';

type DrizzleDb = PostgresJsDatabase<typeof schema>;
type PlayerMatchRow = typeof playerMatchDetails.$inferSelect;

function toPlayerMatch(row: PlayerMatchRow): PlayerMatchDetailsInterface {
  const { id, mongoId, ...rest } = row;
  return { _id: id, ...rest } as unknown as PlayerMatchDetailsInterface;
}

export class DrizzlePlayerMatchRepository implements IPlayerMatchRepository {
  constructor(private db: DrizzleDb) {}

  async findById(id: string): Promise<PlayerMatchDetailsInterface | null> {
    const row = await this.db.query.playerMatchDetails.findFirst({
      where: eq(playerMatchDetails.id, id),
    });
    return row ? toPlayerMatch(row) : null;
  }

  async createMany(
    data: Partial<PlayerMatchDetailsInterface>[]
  ): Promise<PlayerMatchDetailsInterface[]> {
    if (data.length === 0) return [];
    const rows = await this.db
      .insert(playerMatchDetails)
      .values(
        data.map((d) => ({
          ...(d as typeof playerMatchDetails.$inferInsert),
          updatedAt: new Date(),
        }))
      )
      .returning();

    return rows.map(toPlayerMatch);
  }

  async update(
    id: string,
    data: Partial<PlayerMatchDetailsInterface>
  ): Promise<PlayerMatchDetailsInterface | null> {
    const [row] = await this.db
      .update(playerMatchDetails)
      .set({
        ...(data as Partial<typeof playerMatchDetails.$inferInsert>),
        updatedAt: new Date(),
      })
      .where(eq(playerMatchDetails.id, id))
      .returning();

    return row ? toPlayerMatch(row) : null;
  }

  async delete(id: string): Promise<PlayerMatchDetailsInterface> {
    const [row] = await this.db
      .delete(playerMatchDetails)
      .where(eq(playerMatchDetails.id, id))
      .returning();
    if (!row) {
      throw new Error(`PlayerMatchDetails [${id}] does not exist`);
    }
    return toPlayerMatch(row);
  }
}
