import { IMatchReplayRepository } from './MatchReplayRepository';
import { DrizzleMatchReplayRepository } from './drizzle/MatchReplayRepository';
import { DrizzleDatabase } from '../db/drizzle';

export class MatchReplayRepositoryFactory {
  static create(): IMatchReplayRepository {
    return new DrizzleMatchReplayRepository(DrizzleDatabase.getInstance().database);
  }
}
