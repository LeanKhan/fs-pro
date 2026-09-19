import { CalendarInterface } from './calendar.model';
import { CalendarRepositoryFactory } from '../../repositories/CalendarRepositoryFactory';
import {
  allFixturesPlayedForDay,
  findNextUnplayedDay,
  getFixturesInRange,
} from '../fixtures/fixture.service';
import { PlayerFitnessService } from '../../services/players/player-fitness.service';
import { play } from '../game/game.controller';

let calendarRepo: ReturnType<typeof CalendarRepositoryFactory.create> | null =
  null;

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

export async function updateCalendar(
  data: Partial<CalendarInterface>
): Promise<CalendarInterface> {
  return getCalendarRepo().update(data);
}

/**
 * Scans for and auto-simulates any unplayed fixtures strictly before `upToDay`
 * using QuickSim, ensuring past matchdays are never left incomplete.
 */
export async function healPastUnplayedFixtures(upToDay: number): Promise<number> {
  const pastUnplayed = await getFixturesInRange(0, upToDay - 1, { played: false });
  if (!pastUnplayed.length) return 0;

  console.log(
    `[healPastUnplayedFixtures] Found ${pastUnplayed.length} unplayed past fixture(s) before Day ${upToDay}; auto-resolving...`
  );

  let healedCount = 0;

  for (const f of pastUnplayed) {
    if (!f._id) continue;
    try {
      await play(f._id, { quickSim: true });
      healedCount++;
    } catch (err) {
      console.error(`[healPastUnplayedFixtures] Error auto-resolving past fixture ${f._id}:`, err);
    }
  }

  return healedCount;
}

/**
 * Public audit and repair tool: heals any unplayed fixtures from past days
 * up to the current day, and advances the calendar if today is also complete.
 */
export async function healCalendar(): Promise<{
  healedCount: number;
  currentDay: number;
}> {
  const calendar = await getCalendar();
  const healedPast = await healPastUnplayedFixtures(calendar.CurrentDay);
  const advanceResult = await advanceDayIfDone(calendar.CurrentDay);
  const updatedCal = advanceResult ?? (await getCalendar());

  return {
    healedCount: healedPast,
    currentDay: updatedCal.CurrentDay,
  };
}

/**
 * Advances `CurrentDay`/`CurrentDate` to the next scheduled day that still
 * has an unplayed fixture, but only once every fixture on `scheduledDay`
 * itself has been played - a no-op otherwise.
 */
export async function advanceDayIfDone(
  scheduledDay: number
): Promise<CalendarInterface | null> {
  // First, self-heal any unplayed fixtures from prior days to ensure zero ghost fixtures
  await healPastUnplayedFixtures(scheduledDay);

  const done = await allFixturesPlayedForDay(scheduledDay);
  if (!done) {
    return null;
  }

  const next = await findNextUnplayedDay(scheduledDay);
  if (!next) {
    return null;
  }

  const daysElapsed = next.day - scheduledDay;
  if (daysElapsed > 0) {
    try {
      await PlayerFitnessService.recoverFitnessAndInjuries(daysElapsed);
    } catch (err) {
      console.error('Error recovering fitness and injuries on day advance:', err);
    }
  }

  return updateCalendar({ CurrentDay: next.day, CurrentDate: next.date });
}
