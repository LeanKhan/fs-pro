import { ICalendarRepository } from './CalendarRepository';
import { MongoCalendarRepository } from './mongo/CalendarRepository';
import { DrizzleCalendarRepository } from './drizzle/CalendarRepository';
import DB from '../db';
import { DrizzleDatabase } from '../db/drizzle';

/** No Prisma branch - see UserRepositoryFactory for why. */
export class CalendarRepositoryFactory {
  static create(): ICalendarRepository {
    if (DB.ormType === 'drizzle') {
      return new DrizzleCalendarRepository(DrizzleDatabase.getInstance().database);
    }
    return new MongoCalendarRepository();
  }
}
