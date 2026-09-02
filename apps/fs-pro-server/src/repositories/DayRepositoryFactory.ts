import { IDayRepository } from './DayRepository';
import { MongoDayRepository } from './mongo/DayRepository';
import { DrizzleDayRepository } from './drizzle/DayRepository';
import DB from '../db';
import { DrizzleDatabase } from '../db/drizzle';

export class DayRepositoryFactory {
  static create(): IDayRepository {
    if (DB.ormType === 'drizzle') {
      return new DrizzleDayRepository(DrizzleDatabase.getInstance().database);
    }
    return new MongoDayRepository();
  }
}
