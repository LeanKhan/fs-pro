import { eq } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars } from '../../db/drizzle/schema';
import {
  advanceIdleDay,
  healPastUnplayedFixtures,
} from '../../controllers/calendar/calendar.service';
import { MatchdayRunnerService } from '../calendar/matchday-runner.service';
import { expireChallenges } from '../competitions/challenge.service';
import {
  runCompetitionAi,
  type AiReport,
} from '../competitions/ai-competitions.service';
import { tickEditions, type TickReport } from '../competitions/edition.service';
import { openTransferWindow } from '../transfers/transfer-window.service';
import { endYear, yearIsOver, type YearEndSummary } from './year.service';

/**
 * One game day of the open-play world (docs/OPEN-PLAY-COMPETITIONS-SPEC.md,
 * "Calendar clock"). The clock calls this once per tick; admin "advance now"
 * calls it too. Nothing here skips days: every day is visited, in order.
 *
 *   1. Year end, if the year is over (or pause, when AutoRollover is off).
 *   2. Play anything left over from earlier days.
 *   3. Editions: open registration, start/cancel, end stages, knockout rounds.
 *   4. Expire unanswered challenges (forfeits past the decline limit).
 *   5. AI clubs register, answer and send challenges; human policies.
 *   6. Open a transfer window that starts today.
 *   7. Play today's matches.
 *   8. Move the calendar on one day (fitness recovery, transfer market).
 */

const db = () => DrizzleDatabase.getInstance().database;

export interface WorldDayReport {
  day: number;
  /** True when the year is over but AutoRollover is off: nothing ran, the
   * clock was paused, and the admin has to end the year. */
  pausedForYearEnd: boolean;
  yearEnded: YearEndSummary | null;
  healed: number;
  editions: TickReport | null;
  challenges: { expired: number; forfeited: number } | null;
  ai: AiReport | null;
  transferWindowOpened: boolean;
  matches: { total: number; simulated: number; failed: number };
  advancedTo: number | null;
}

async function world() {
  const [calendar] = await db().select().from(calendars).limit(1);
  if (!calendar)
    throw new Error('No calendar row: the game world has not been set up');
  return calendar;
}

/** Opens the window whose first day-of-year is today (day 1 = YearStartDay). */
async function applyTransferWindows(calendar: typeof calendars.$inferSelect) {
  const dayOfYear = calendar.CurrentDay - calendar.YearStartDay + 1;
  const window = calendar.TransferWindows.find((w) => w.fromDay === dayOfYear);
  if (!window) return false;
  await openTransferWindow(Math.max(0, window.toDay - window.fromDay));
  return true;
}

/** Run one game day. Errors in a step are logged and the day carries on,
 * except a failure to move the calendar, which is thrown. */
export async function runWorldDay(): Promise<WorldDayReport> {
  let calendar = await world();
  const day = calendar.CurrentDay;
  const report: WorldDayReport = {
    day,
    pausedForYearEnd: false,
    yearEnded: null,
    healed: 0,
    editions: null,
    challenges: null,
    ai: null,
    transferWindowOpened: false,
    matches: { total: 0, simulated: 0, failed: 0 },
    advancedTo: null,
  };
  const step = async <T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<T | null> => {
    try {
      return await fn();
    } catch (err) {
      console.error(`[world-day] day ${day}: ${name} failed`, err);
      return null;
    }
  };

  if (yearIsOver(calendar)) {
    if (!calendar.AutoRollover) {
      await db()
        .update(calendars)
        .set({ ClockMode: 'paused', updatedAt: new Date() })
        .where(eq(calendars.id, calendar.id));
      report.pausedForYearEnd = true;
      return report;
    }
    report.yearEnded = await step('year end', endYear);
    calendar = await world();
  }

  report.healed =
    (await step('heal past days', () => healPastUnplayedFixtures(day))) ?? 0;
  report.editions = await step('editions', () => tickEditions(day));
  report.challenges = await step('challenge expiry', () =>
    expireChallenges(day)
  );
  report.ai = await step('competition AI', () => runCompetitionAi());
  report.transferWindowOpened =
    (await step('transfer windows', () => applyTransferWindows(calendar))) ??
    false;

  const run = await step('matches', () =>
    MatchdayRunnerService.simulateDay(day, { skipAdvance: true })
  );
  if (run) {
    report.matches = {
      total: run.totalFixtures,
      simulated: run.simulatedFixtures,
      failed: run.failedFixtures,
    };
  }

  const advanced = await advanceIdleDay();
  report.advancedTo = advanced.CurrentDay;
  return report;
}
