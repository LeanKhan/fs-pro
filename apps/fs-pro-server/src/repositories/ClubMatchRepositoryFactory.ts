import { IClubMatchRepository } from './ClubMatchRepository';
import { DrizzleClubMatchRepository } from './drizzle/ClubMatchRepository';
import { DrizzleDatabase } from '../db/drizzle';

export class ClubMatchRepositoryFactory {
  static create(): IClubMatchRepository {
    return new DrizzleClubMatchRepository(
      DrizzleDatabase.getInstance().database
    );
  }
}
