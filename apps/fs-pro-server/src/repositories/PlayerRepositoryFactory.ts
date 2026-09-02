import { IPlayerRepository } from './PlayerRepository';
import { DrizzlePlayerRepository } from './drizzle/PlayerRepository';
import { DrizzleDatabase } from '../db/drizzle';

export class PlayerRepositoryFactory {
  static create(): IPlayerRepository {
    return new DrizzlePlayerRepository(DrizzleDatabase.getInstance().database);
  }
}
