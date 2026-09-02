import { eq } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { MatchReplayRecord } from '../../controllers/match-replays/match-replay.model';
import * as schema from '../../db/drizzle/full-schema';
import { matchReplays } from '../../db/drizzle/schema';
import { IMatchReplayRepository } from '../MatchReplayRepository';

type DrizzleDb = PostgresJsDatabase<typeof schema>;
type MatchReplayRow = typeof matchReplays.$inferSelect;

function toMatchReplay(row: MatchReplayRow): MatchReplayRecord {
  const { id, mongoId, ...rest } = row;
  return { _id: id, ...rest } as unknown as MatchReplayRecord;
}

export class DrizzleMatchReplayRepository implements IMatchReplayRepository {
  constructor(private db: DrizzleDb) {}

  async findByFixtureId(fixtureId: string): Promise<MatchReplayRecord | null> {
    const row = await this.db.query.matchReplays.findFirst({
      where: eq(matchReplays.Fixture, fixtureId),
    });
    return row ? toMatchReplay(row) : null;
  }

  async upsertByFixtureId(
    fixtureId: string,
    data: Partial<MatchReplayRecord>
  ): Promise<MatchReplayRecord> {
    const values = {
      ...(data as typeof matchReplays.$inferInsert),
      Fixture: fixtureId,
      updatedAt: new Date(),
    };

    const [row] = await this.db
      .insert(matchReplays)
      .values(values)
      .onConflictDoUpdate({ target: matchReplays.Fixture, set: values })
      .returning();

    return toMatchReplay(row);
  }
}
