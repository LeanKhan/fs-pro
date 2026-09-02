import DB from '../../db';
import { CalendarInterface } from './calendar.model';
import { CalendarRepositoryFactory } from '../../repositories/CalendarRepositoryFactory';
import { ICalendarFilter } from '../../repositories/CalendarRepository';
import { getDaysForCalendarPage } from '../days/day.service';

/**
 * Repository-backed functions below cover the identity/CRUD surface plus
 * `activateCalendarYear` (the `startYear` multi-row `isActive` flip) - see
 * ICalendarRepository's doc comment for exactly what each covers and why.
 */
let calendarRepo: ReturnType<typeof CalendarRepositoryFactory.create> | null = null;

function getCalendarRepo() {
  if (!calendarRepo) {
    calendarRepo = CalendarRepositoryFactory.create();
  }
  return calendarRepo;
}

export async function getCalendarById(id: string) {
  return getCalendarRepo().findById(id);
}

export async function getCalendars(filter?: ICalendarFilter) {
  return getCalendarRepo().findAll(filter);
}

export async function createCalendar(data: Partial<CalendarInterface>) {
  return getCalendarRepo().create(data);
}

export async function updateCalendarFields(id: string, data: Partial<CalendarInterface>) {
  return getCalendarRepo().update(id, data);
}

export async function deleteCalendarById(id: string) {
  return getCalendarRepo().delete(id);
}

export async function activateCalendarYear(yearString: string) {
  return getCalendarRepo().activateYear(yearString);
}

/**
 * Looks a calendar up by its (in-practice-unique) `YearString` and applies a
 * plain-field update - a read-then-write replacement for the raw
 * `findOneAndUpdate({ YearString }, ...)` call sites (`changeCurrentDay`,
 * `middleware/seasons.ts`'s season-creation lookup), since the repository's
 * `update()` only takes an id.
 */
export async function updateCalendarByYearString(yearString: string, data: Partial<CalendarInterface>) {
  const [calendar] = await getCalendars({ YearString: yearString });
  if (!calendar) {
    return null;
  }
  return updateCalendarFields(calendar._id as string, data);
}

/**
 * Same read-by-`YearString` lookup as above, but for callers that only need
 * the record (`middleware/seasons.ts`'s `findCalendar` - was the raw
 * `fetchOne({ YearString })`).
 */
export async function getCalendarByYearString(yearString: string) {
  const [calendar] = await getCalendars({ YearString: yearString });
  return calendar ?? null;
}

/**
 * fetchAll
 */
export function fetchAll(query: unknown = {}) {
  return DB.Models.Calendar.find(query).lean().exec();
}

/**
  fetch one calendar based on query
*/
export async function fetchOne(
  query: ICalendarFilter & { _id?: string },
  populate: boolean | string = false,
  paginate: { skip: number; limit: number } = { skip: 0, limit: 14 }
): Promise<CalendarInterface | null> {
  let calendar: CalendarInterface | null;

  if (query._id) {
    calendar = await getCalendarById(query._id);
  } else {
    const { isActive, YearString } = query;
    const [firstCalendar] = await getCalendars({ isActive, YearString });
    calendar = firstCalendar ?? null;
  }

  if (!calendar || !populate) {
    return calendar;
  }

  const calendarDays = await getDaysForCalendarPage({
    Calendar: calendar._id as string,
    skip: paginate.skip,
    limit: paginate.limit,
  });

  return { ...calendar, Days: calendarDays as any };
}

/** update Calendar */
export function updateCalendar(id: string, update: any) {
  return DB.Models.Calendar.findByIdAndUpdate(id, update, { new: true })
    .lean()
    .exec();
}

export function createCalendars(Calendars: any[]) {
  return DB.Models.Calendar.insertMany(Calendars, { ordered: true });
}

export function deleteById(id: string) {
  /**
  * Delete the Calendar, then Days, Seasons & Fixtures, then
  */

  const todelete = [ DB.Models.Calendar.findByIdAndDelete(id).lean().exec(), DB.Models.Day.deleteMany({Calendar: id}).lean().exec()];

  return Promise.all(todelete);
}

export async function deleteByRemove(id: string) {
  /**
  * Delete the Calendar, then Days, Seasons & Fixtures, then
  */

  const doc = await DB.Models.Calendar.findById(id);

  if(!doc) {
    throw new Error(`Calendar ${id} does not exist`);
  }

  return doc.remove();
};

