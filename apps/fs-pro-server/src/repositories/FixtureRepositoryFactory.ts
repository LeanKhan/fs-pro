import { IFixtureRepository } from './FixtureRepository';
import { DrizzleFixtureRepository } from './drizzle/FixtureRepository';
import { DrizzleDatabase } from '../db/drizzle';

export class FixtureRepositoryFactory {
  static create(): IFixtureRepository {
    return new DrizzleFixtureRepository(DrizzleDatabase.getInstance().database);
  }
}
