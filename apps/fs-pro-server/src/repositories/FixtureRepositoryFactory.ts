import { IFixtureRepository } from './FixtureRepository';
import { MongoFixtureRepository } from './mongo/FixtureRepository';
import { DrizzleFixtureRepository } from './drizzle/FixtureRepository';
import DB from '../db';
import { DrizzleDatabase } from '../db/drizzle';

/** No Prisma branch - see UserRepositoryFactory for why. */
export class FixtureRepositoryFactory {
  static create(): IFixtureRepository {
    if (DB.ormType === 'drizzle') {
      return new DrizzleFixtureRepository(DrizzleDatabase.getInstance().database);
    }
    return new MongoFixtureRepository();
  }
}
