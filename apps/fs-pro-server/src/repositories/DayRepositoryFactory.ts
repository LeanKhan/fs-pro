import { IDayRepository } from './DayRepository';
import { DrizzleDayRepository } from './drizzle/DayRepository';
import { DrizzleDatabase } from '../db/drizzle';

export class DayRepositoryFactory {
  static create(): IDayRepository {
    return new DrizzleDayRepository(DrizzleDatabase.getInstance().database);
  }
}
