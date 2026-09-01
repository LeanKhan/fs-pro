import { ICalendarRepository, ICalendarFilter } from '../CalendarRepository';
import DB from '../../db';
import { CalendarInterface } from '../../controllers/calendar/calendar.model';

export class MongoCalendarRepository implements ICalendarRepository {
  async findById(id: string): Promise<CalendarInterface | null> {
    return DB.Models.Calendar.findById(id).lean().exec();
  }

  async findAll(filter: ICalendarFilter = {}): Promise<CalendarInterface[]> {
    return DB.Models.Calendar.find(filter).lean().exec();
  }

  async create(data: Partial<CalendarInterface>): Promise<CalendarInterface> {
    const calendar = await DB.Models.Calendar.create(data);
    return calendar.toObject();
  }

  async update(id: string, data: Partial<CalendarInterface>): Promise<CalendarInterface | null> {
    return DB.Models.Calendar.findByIdAndUpdate(id, data, { new: true }).lean().exec();
  }

  async delete(id: string): Promise<CalendarInterface> {
    const calendar = await DB.Models.Calendar.findByIdAndDelete(id).lean().exec();
    if (!calendar) {
      throw new Error(`Calendar [${id}] does not exist`);
    }
    return calendar;
  }

  async activateYear(yearString: string): Promise<void> {
    await DB.Models.Calendar.updateMany({}, [
      { $set: { isActive: { $eq: ['$YearString', yearString] }, CurrentDay: 0 } },
    ]);
  }
}
