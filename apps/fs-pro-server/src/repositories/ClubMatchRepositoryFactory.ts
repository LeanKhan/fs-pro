import { IClubMatchRepository } from './ClubMatchRepository';
import { MongoClubMatchRepository } from './mongo/ClubMatchRepository';
import { DrizzleClubMatchRepository } from './drizzle/ClubMatchRepository';
import DB from '../db';
import { DrizzleDatabase } from '../db/drizzle';

export class ClubMatchRepositoryFactory {
  static create(): IClubMatchRepository {
    if (DB.ormType === 'drizzle') {
      return new DrizzleClubMatchRepository(DrizzleDatabase.getInstance().database);
    }
    return new MongoClubMatchRepository();
  }
}
