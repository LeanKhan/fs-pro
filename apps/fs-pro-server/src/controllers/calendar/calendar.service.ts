import { CalendarInterface } from './calendar.model';
import { CalendarRepositoryFactory } from '../../repositories/CalendarRepositoryFactory';
import { allFixturesPlayedForDay, findNextUnplayedDay } from '../fixtures/fixture.service';

let calendarRepo: ReturnType<typeof CalendarRepositoryFactory.create> | null = null;

function getCalendarRepo() {
  if (!calendarRepo) {
    calendarRepo = CalendarRepositoryFactory.create();
  }
  return calendarRepo;
}

/** The one Calendar row - bootstrap-inserted the first time it's read. */
export async function getCalendar(): Promise<CalendarInterface> {
  return getCalendarRepo().get();
}

export async function updateCalendar(data: Partial<CalendarInterface>): Promise<CalendarInterface> {
  return getCalendarRepo().update(data);
}

/**
 * Advances `CurrentDay`/`CurrentDate` to the next scheduled day that still
 * has an unplayed fixture, but only once every fixture on `scheduledDay`
 * itself has been played - a no-op otherwise. Replaces the old
 * `changeCurrentDay`/`findNextPlayableDay` pair, which walked `Day.Matches`
 * arrays to answer the same two questions ("is today done" / "what's the
 * next playable day").
 */
export async function advanceDayIfDone(scheduledDay: number): Promise<CalendarInterface | null> {
  const done = await allFixturesPlayedForDay(scheduledDay);
  if (!done) {
    return null;
  }

  const next = await findNextUnplayedDay(scheduledDay);
  if (!next) {
    return null;
  }

  return updateCalendar({ CurrentDay: next.day, CurrentDate: next.date });
}
