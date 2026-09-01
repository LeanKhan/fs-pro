import { IAwardRepository } from './AwardRepository';
import { MongoAwardRepository } from './mongo/AwardRepository';
import { DrizzleAwardRepository } from './drizzle/AwardRepository';
import DB from '../db';
import { DrizzleDatabase } from '../db/drizzle';

export class AwardRepositoryFactory {
  static create(): IAwardRepository {
    if (DB.ormType === 'drizzle') {
      return new DrizzleAwardRepository(DrizzleDatabase.getInstance().database);
    }
    return new MongoAwardRepository();
  }
}
