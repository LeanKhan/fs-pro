import { IUserRepository } from './UserRepository';
import { MongoUserRepository } from './mongo/UserRepository';
import { DrizzleUserRepository } from './drizzle/UserRepository';
import DB from '../db';
import { DrizzleDatabase } from '../db/drizzle';

/**
 * No Prisma branch, unlike PlaceRepositoryFactory - Prisma is an earlier,
 * inactive parallel attempt (all real migration work this session is
 * Drizzle-based), so `ormType === 'prisma'` falls back to Mongo here rather
 * than a repository that was never built.
 */
export class UserRepositoryFactory {
  static create(): IUserRepository {
    if (DB.ormType === 'drizzle') {
      return new DrizzleUserRepository(DrizzleDatabase.getInstance().database);
    }
    return new MongoUserRepository();
  }
}
