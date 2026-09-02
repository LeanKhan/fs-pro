import { IMatchReplayRepository } from './MatchReplayRepository';
import { MongoMatchReplayRepository } from './mongo/MatchReplayRepository';
import { DrizzleMatchReplayRepository } from './drizzle/MatchReplayRepository';
import DB from '../db';
import { DrizzleDatabase } from '../db/drizzle';

export class MatchReplayRepositoryFactory {
  static create(): IMatchReplayRepository {
    if (DB.ormType === 'drizzle') {
      return new DrizzleMatchReplayRepository(DrizzleDatabase.getInstance().database);
    }
    return new MongoMatchReplayRepository();
  }
}
