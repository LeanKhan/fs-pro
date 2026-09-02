import { IClubRepository } from './ClubRepository';
import { DrizzleClubRepository } from './drizzle/ClubRepository';
import { DrizzleDatabase } from '../db/drizzle';

export class ClubRepositoryFactory {
  static create(): IClubRepository {
    return new DrizzleClubRepository(DrizzleDatabase.getInstance().database);
  }
}
