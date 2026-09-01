import { IMatchReplayRepository } from '../MatchReplayRepository';
import DB from '../../db';
import { MatchReplayRecord } from '../../controllers/match-replays/match-replay.model';

export class MongoMatchReplayRepository implements IMatchReplayRepository {
  async findByFixtureId(fixtureId: string): Promise<MatchReplayRecord | null> {
    return DB.Models.MatchReplay.findOne({ Fixture: fixtureId }).lean().exec();
  }

  async upsertByFixtureId(fixtureId: string, data: Partial<MatchReplayRecord>): Promise<MatchReplayRecord> {
    return DB.Models.MatchReplay.findOneAndUpdate(
      { Fixture: fixtureId },
      { ...data, Fixture: fixtureId },
      { upsert: true, new: true }
    )
      .lean()
      .exec();
  }
}
