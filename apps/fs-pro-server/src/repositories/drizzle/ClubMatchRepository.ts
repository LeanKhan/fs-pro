import { eq } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { ClubMatchDetailsInterface } from '../../controllers/club-match/club-match.model';
import * as schema from '../../db/drizzle/full-schema';
import { clubMatchDetails, playerMatchDetails } from '../../db/drizzle/schema';
import { IClubMatchRepository } from '../ClubMatchRepository';

type DrizzleDb = PostgresJsDatabase<typeof schema>;
type ClubMatchRow = typeof clubMatchDetails.$inferSelect;
type PlayerMatchRow = typeof playerMatchDetails.$inferSelect;

/** Same `id` -> `_id` remap every other Drizzle repository does.
 * `PlayerStats` comes back as full PlayerMatchDetails rows (via the reverse
 * `playerMatchDetails.ClubMatchDetails` FK) rather than bare ids, matching
 * Mongo's own populated shape - see IClubMatchRepository's doc comment. */
function toClubMatch(row: ClubMatchRow & { playerStats?: PlayerMatchRow[] }): ClubMatchDetailsInterface {
  const { id, mongoId, playerStats, ...rest } = row;
  return {
    _id: id,
    ...rest,
    PlayerStats: (playerStats ?? []).map((p) => {
      const { id: pid, mongoId: pMongoId, ...pRest } = p;
      return { _id: pid, ...pRest };
    }),
  } as unknown as ClubMatchDetailsInterface;
}

export class DrizzleClubMatchRepository implements IClubMatchRepository {
  constructor(private db: DrizzleDb) {}

  async findById(id: string): Promise<ClubMatchDetailsInterface | null> {
    const row = await this.db.query.clubMatchDetails.findFirst({
      where: eq(clubMatchDetails.id, id),
      with: { playerStats: true },
    });
    return row ? toClubMatch(row) : null;
  }

  async create(data: Partial<ClubMatchDetailsInterface>): Promise<ClubMatchDetailsInterface> {
    const [row] = await this.db
      .insert(clubMatchDetails)
      .values({ ...(data as typeof clubMatchDetails.$inferInsert), updatedAt: new Date() })
      .returning();

    return toClubMatch({ ...row, playerStats: [] });
  }

  async update(id: string, data: Partial<ClubMatchDetailsInterface>): Promise<ClubMatchDetailsInterface | null> {
    const [row] = await this.db
      .update(clubMatchDetails)
      .set({ ...(data as Partial<typeof clubMatchDetails.$inferInsert>), updatedAt: new Date() })
      .where(eq(clubMatchDetails.id, id))
      .returning();

    return row ? toClubMatch({ ...row, playerStats: [] }) : null;
  }

  async delete(id: string): Promise<ClubMatchDetailsInterface> {
    const [row] = await this.db.delete(clubMatchDetails).where(eq(clubMatchDetails.id, id)).returning();
    if (!row) {
      throw new Error(`ClubMatchDetails [${id}] does not exist`);
    }
    return toClubMatch({ ...row, playerStats: [] });
  }
}
