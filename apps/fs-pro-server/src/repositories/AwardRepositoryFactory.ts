import { IAwardRepository } from './AwardRepository';
import { DrizzleAwardRepository } from './drizzle/AwardRepository';
import { DrizzleDatabase } from '../db/drizzle';

export class AwardRepositoryFactory {
  static create(): IAwardRepository {
    return new DrizzleAwardRepository(DrizzleDatabase.getInstance().database);
  }
}
