import { IPlayerMatchRepository } from './PlayerMatchRepository';
import { MongoPlayerMatchRepository } from './mongo/PlayerMatchRepository';
import { DrizzlePlayerMatchRepository } from './drizzle/PlayerMatchRepository';
import DB from '../db';
import { DrizzleDatabase } from '../db/drizzle';

export class PlayerMatchRepositoryFactory {
  static create(): IPlayerMatchRepository {
    if (DB.ormType === 'drizzle') {
      return new DrizzlePlayerMatchRepository(DrizzleDatabase.getInstance().database);
    }
    return new MongoPlayerMatchRepository();
  }
}
