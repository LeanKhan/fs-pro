import { IClubRepository } from './ClubRepository';
import { MongoClubRepository } from './mongo/ClubRepository';
import { DrizzleClubRepository } from './drizzle/ClubRepository';
import DB from '../db';
import { DrizzleDatabase } from '../db/drizzle';

/** No Prisma branch - see UserRepositoryFactory for why. */
export class ClubRepositoryFactory {
  static create(): IClubRepository {
    if (DB.ormType === 'drizzle') {
      return new DrizzleClubRepository(DrizzleDatabase.getInstance().database);
    }
    return new MongoClubRepository();
  }
}
