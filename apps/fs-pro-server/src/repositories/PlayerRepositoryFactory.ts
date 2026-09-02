import { IPlayerRepository } from './PlayerRepository';
import { MongoPlayerRepository } from './mongo/PlayerRepository';
import { DrizzlePlayerRepository } from './drizzle/PlayerRepository';
import DB from '../db';
import { DrizzleDatabase } from '../db/drizzle';

/** No Prisma branch - see UserRepositoryFactory for why. */
export class PlayerRepositoryFactory {
  static create(): IPlayerRepository {
    if (DB.ormType === 'drizzle') {
      return new DrizzlePlayerRepository(DrizzleDatabase.getInstance().database);
    }
    return new MongoPlayerRepository();
  }
}
