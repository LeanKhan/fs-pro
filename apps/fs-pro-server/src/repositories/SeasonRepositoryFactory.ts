import { ISeasonRepository } from './SeasonRepository';
import { MongoSeasonRepository } from './mongo/SeasonRepository';
import { DrizzleSeasonRepository } from './drizzle/SeasonRepository';
import DB from '../db';
import { DrizzleDatabase } from '../db/drizzle';

/** No Prisma branch - see UserRepositoryFactory for why. */
export class SeasonRepositoryFactory {
  static create(): ISeasonRepository {
    if (DB.ormType === 'drizzle') {
      return new DrizzleSeasonRepository(DrizzleDatabase.getInstance().database);
    }
    return new MongoSeasonRepository();
  }
}
