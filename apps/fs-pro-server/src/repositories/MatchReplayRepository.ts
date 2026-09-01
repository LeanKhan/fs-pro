import { MatchReplayRecord } from '../controllers/match-replays/match-replay.model';

/**
 * `Fixture` is unique on both backends, so "save a replay" is always an
 * upsert keyed on it (a fixture can in principle be replayed more than
 * once in dev/testing flows - the latest simulation should win).
 */
export interface IMatchReplayRepository {
  findByFixtureId(fixtureId: string): Promise<MatchReplayRecord | null>;
  upsertByFixtureId(fixtureId: string, data: Partial<MatchReplayRecord>): Promise<MatchReplayRecord>;
}
