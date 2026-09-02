import { IPlayerMatchRepository } from './PlayerMatchRepository';
import { DrizzlePlayerMatchRepository } from './drizzle/PlayerMatchRepository';
import { DrizzleDatabase } from '../db/drizzle';

export class PlayerMatchRepositoryFactory {
  static create(): IPlayerMatchRepository {
    return new DrizzlePlayerMatchRepository(
      DrizzleDatabase.getInstance().database
    );
  }
}
