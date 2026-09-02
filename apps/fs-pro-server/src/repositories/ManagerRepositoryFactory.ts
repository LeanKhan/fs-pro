import { IManagerRepository } from './ManagerRepository';
import { MongoManagerRepository } from './mongo/ManagerRepository';
import { DrizzleManagerRepository } from './drizzle/ManagerRepository';
import DB from '../db';
import { DrizzleDatabase } from '../db/drizzle';

/** No Prisma branch - see UserRepositoryFactory for why. */
export class ManagerRepositoryFactory {
  static create(): IManagerRepository {
    if (DB.ormType === 'drizzle') {
      return new DrizzleManagerRepository(DrizzleDatabase.getInstance().database);
    }
    return new MongoManagerRepository();
  }
}
