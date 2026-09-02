import { DayInterface } from './day.model';
import { DayRepositoryFactory } from '../../repositories/DayRepositoryFactory';

/**
 * Days is sparse now - a row only exists for a day that has a real,
 * non-match calendar event (see `db/drizzle/schema.ts`'s `days` table doc
 * comment). Everything the old `Day.Matches` array used to answer (which
 * fixtures play on a given day, whether they're all played) now lives on
 * `Fixture.ScheduledDay`/`ScheduledDate` directly - see
 * `fixture.service.ts`'s `getFixturesByDay`/`getFixturesInRange`/
 * `allFixturesPlayedForDay`.
 */
let dayRepo: ReturnType<typeof DayRepositoryFactory.create> | null = null;

function getDayRepo() {
  if (!dayRepo) {
    dayRepo = DayRepositoryFactory.create();
  }
  return dayRepo;
}

export async function createDay(data: Partial<DayInterface>) {
  return getDayRepo().create(data);
}

export async function updateDayFields(id: string, data: Partial<DayInterface>) {
  return getDayRepo().update(id, data);
}

export async function deleteDayById(id: string) {
  return getDayRepo().delete(id);
}

/** Calendar events (not matches) scheduled within an inclusive day range. */
export async function getEvents(fromDay: number, toDay: number) {
  return getDayRepo().findAll({ indexFrom: fromDay, indexTo: toDay });
}
