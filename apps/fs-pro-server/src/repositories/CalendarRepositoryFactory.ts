import { ICalendarRepository } from './CalendarRepository';
import { DrizzleCalendarRepository } from './drizzle/CalendarRepository';
import { DrizzleDatabase } from '../db/drizzle';

export class CalendarRepositoryFactory {
  static create(): ICalendarRepository {
    return new DrizzleCalendarRepository(DrizzleDatabase.getInstance().database);
  }
}
