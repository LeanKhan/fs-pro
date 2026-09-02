import { ISeasonRepository } from './SeasonRepository';
import { DrizzleSeasonRepository } from './drizzle/SeasonRepository';
import { DrizzleDatabase } from '../db/drizzle';

export class SeasonRepositoryFactory {
  static create(): ISeasonRepository {
    return new DrizzleSeasonRepository(DrizzleDatabase.getInstance().database);
  }
}
