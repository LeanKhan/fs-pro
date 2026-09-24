import { runTransferDay } from '../../services/transfers/transfer-market.service';
import { CalendarInterface } from './calendar.model';
import { CalendarRepositoryFactory } from '../../repositories/CalendarRepositoryFactory';
import { getFixturesInRange } from '../fixtures/fixture.service';
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
export async function healPastUnplayedFixtures(
  upToDay: number
): Promise<number> {
  const pastUnplayed = await getFixturesInRange(0, upToDay - 1, {
    played: false,
  });
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
 * Public audit and repair tool: plays any fixtures left unplayed on days
 * before today. The world day loop moves the calendar, not this.
 */
export async function healCalendar(): Promise<{
  healedCount: number;
  currentDay: number;
}> {
  const calendar = await getCalendar();
  const healedPast = await healPastUnplayedFixtures(calendar.CurrentDay);
  return { healedCount: healedPast, currentDay: calendar.CurrentDay };
}

/** Most game days of AI transfer activity run for one calendar advance, so a
 * long jump (e.g. simulate-to-date) does not flood the market in one go. */
const MAX_TRANSFER_DAYS_PER_ADVANCE = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Moves the calendar from `fromDay` to `toDay` and runs everything that
 * happens as game days pass: fitness recovery and the AI transfer market. Shared by the normal fixture-to-fixture advance
 * and the off-season idle-day advance.
 */
async function applyDayAdvance(
  fromDay: number,
  toDay: number,
  toDate: Date
): Promise<CalendarInterface> {
  const daysElapsed = toDay - fromDay;
  if (daysElapsed > 0) {
    try {
      await PlayerFitnessService.recoverFitnessAndInjuries(daysElapsed);
    } catch (err) {
      console.error('Error recovering fitness and injuries on day advance:', err);
    }
  }

  const advanced = await updateCalendar({
    CurrentDay: toDay,
    CurrentDate: toDate,
  });

  // The transfer market moves with the calendar: expire stale offers and, while
  // the window is open, let AI clubs bid and trade for each day that passed.
  try {
    const firstDay = Math.max(fromDay + 1, toDay - MAX_TRANSFER_DAYS_PER_ADVANCE + 1);
    for (let day = firstDay; day <= toDay; day++) {
      await runTransferDay(day);
    }
  } catch (err) {
    console.error('[calendar] Error running the transfer market:', err);
  }

  return advanced;
}

/**
 * Moves the calendar forward exactly one game day (fitness recovery, the AI
 * transfer market). Called once per world day by
 * services/world/world-day.service.ts after the day's matches.
 */
export async function advanceIdleDay(): Promise<CalendarInterface> {
  const cal = await getCalendar();
  return applyDayAdvance(
    cal.CurrentDay,
    cal.CurrentDay + 1,
    new Date(new Date(cal.CurrentDate).getTime() + DAY_MS)
  );
}
