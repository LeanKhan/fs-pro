import { and, eq, gte, isNotNull, ne } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars, fixtures, levelHistory } from '../../db/drizzle/schema';
import { emitOpenPlay } from '../../realtime/open-play-events';
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
import { sweepCaretakers } from './caretaker.service';

/**
 * The world's clock work (docs/WORLD-PYRAMID-SPEC.md, "Calendar"). A game
 * day has 24 hours and the clock ticks once per hour (runWorldHour):
 *
 *   hour 0      day start: year end (or pause when AutoRollover is off),
 *               leftovers from earlier days, editions, challenge expiry,
 *               competition AI, transfer windows, caretakers;
 *   every hour  the matches kicking off this hour (and any earlier kickoff
 *               of today still unplayed);
 *   hour 23     day end: the calendar moves on one day (fitness recovery,
 *               transfer market) and the hour goes back to 0.
 *
 * runWorldDay runs the rest of the current day in one go (admin "advance
 * now", fast-forward, tests). Nothing skips days or hours.
 */

const db = () => DrizzleDatabase.getInstance().database;

export interface WorldDayReport {
  day: number;
  /** First and last hour of the day this report covers. */
  hours: [number, number];
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

const newReport = (day: number, hour: number): WorldDayReport => ({
  day,
  hours: [hour, hour],
  pausedForYearEnd: false,
  yearEnded: null,
  healed: 0,
  editions: null,
  challenges: null,
  ai: null,
  transferWindowOpened: false,
  matches: { total: 0, simulated: 0, failed: 0 },
  advancedTo: null,
});

async function step<T>(day: number, name: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[world-day] day ${day}: ${name} failed`, err);
    return null;
  }
}

/** Hour 0: everything that happens once a day before the first kickoff. */
async function dayStart(report: WorldDayReport) {
  let calendar = await world();
  const day = report.day;
  if (yearIsOver(calendar)) {
    if (!calendar.AutoRollover) {
      await db()
        .update(calendars)
        .set({ ClockMode: 'paused', updatedAt: new Date() })
        .where(eq(calendars.id, calendar.id));
      report.pausedForYearEnd = true;
      return;
    }
    report.yearEnded = await step(day, 'year end', endYear);
    calendar = await world();
  }

  report.healed = (await step(day, 'heal past days', () => healPastUnplayedFixtures(day))) ?? 0;
  report.editions = await step(day, 'editions', () => tickEditions(day));
  report.challenges = await step(day, 'challenge expiry', () => expireChallenges(day));
  report.ai = await step(day, 'competition AI', () => runCompetitionAi());
  report.transferWindowOpened =
    (await step(day, 'transfer windows', () => applyTransferWindows(calendar))) ?? false;
  await step(day, 'caretakers', () => sweepCaretakers(calendar));
}

/**
 * One hour of the world: day start at hour 0, the matches kicking off by
 * this hour, and after hour 23 the day end. Errors in a step are logged and
 * the hour carries on, except a failure to move the calendar, which is
 * thrown.
 */
export async function runWorldHour(): Promise<WorldDayReport> {
  const calendar = await world();
  const hour = Math.min(23, Math.max(0, calendar.CurrentHour ?? 0));
  const report = newReport(calendar.CurrentDay, hour);
  if (hour === 0) {
    await dayStart(report);
    if (report.pausedForYearEnd) return report;
  }

  const run = await step(report.day, 'matches', () =>
    MatchdayRunnerService.simulateDay(report.day, { upToHour: hour })
  );
  if (run) {
    report.matches = {
      total: run.totalFixtures,
      simulated: run.simulatedFixtures,
      failed: run.failedFixtures,
    };
  }

  if (hour >= 23) {
    const advanced = await advanceIdleDay();
    await db().update(calendars).set({ CurrentHour: 0, updatedAt: new Date() }).where(eq(calendars.id, calendar.id));
    report.advancedTo = advanced.CurrentDay;
  } else {
    await db().update(calendars).set({ CurrentHour: hour + 1, updatedAt: new Date() }).where(eq(calendars.id, calendar.id));
  }
  await step(report.day, 'realtime', () => announce(report));
  return report;
}

/** The rest of the current game day, hour by hour, in one call. */
export async function runWorldDay(): Promise<WorldDayReport> {
  const total = await runWorldHour();
  while (!total.pausedForYearEnd && total.advancedTo == null) {
    const r = await runWorldHour();
    total.hours = [total.hours[0], r.hours[1]];
    total.matches = {
      total: total.matches.total + r.matches.total,
      simulated: total.matches.simulated + r.matches.simulated,
      failed: total.matches.failed + r.matches.failed,
    };
    total.advancedTo = r.advancedTo;
    total.pausedForYearEnd = r.pausedForYearEnd;
  }
  return total;
}

/** Tell connected clients what the hour changed (they refetch). */
async function announce(report: WorldDayReport) {
  if (report.yearEnded)
    emitOpenPlay('world:year-ended', { year: report.yearEnded.year, label: report.yearEnded.label });
  const e = report.editions;
  const changed = e
    ? [...new Set([...e.opened, ...e.started, ...e.cancelled, ...e.stagesEnded, ...e.finished, ...e.roundsDrawn])]
    : [];
  if (changed.length) emitOpenPlay('edition:updated', { editionIds: changed, reason: 'day' });
  if (report.matches.simulated > 0) {
    const played = await db()
      .selectDistinct({ seasonId: fixtures.SeasonId })
      .from(fixtures)
      .where(and(eq(fixtures.ScheduledDay, report.day), eq(fixtures.Played, true), isNotNull(fixtures.SeasonId)));
    const editionIds = played.map((r) => r.seasonId).filter((id): id is string => !!id);
    if (editionIds.length) emitOpenPlay('rankings:updated', { editionIds });
  }
  if (report.hours[0] === 0) {
    const moves = await db()
      .select()
      .from(levelHistory)
      .where(and(gte(levelHistory.Day, report.day - 1), ne(levelHistory.FromLevel, levelHistory.ToLevel)));
    for (const m of moves)
      emitOpenPlay('club:level-changed', { clubId: m.ClubId, from: m.FromLevel, to: m.ToLevel, source: m.Source });
  }
  if (report.advancedTo != null)
    emitOpenPlay('world:day', { day: report.day, nextDay: report.advancedTo, matches: report.matches.simulated });
}

export interface SimulateToDayResult {
  startDay: number;
  currentDay: number;
  currentDate: string;
  simulatedFixtures: number;
  failedFixtures: number;
  simulatedDays: number;
}

/**
 * Admin fast-forward: run world days until the calendar reaches `targetDay`
 * (inclusive of it unless `includeTargetDay` is false), at most 365 days at
 * a time. Every day runs the full loop, so nothing is skipped; stops early
 * if the year end pauses the world.
 */
export async function runWorldDaysUntil(
  targetDay: number,
  includeTargetDay = true
): Promise<SimulateToDayResult> {
  const start = await world();
  const lastDay = includeTargetDay ? targetDay : targetDay - 1;
  let simulatedFixtures = 0;
  let failedFixtures = 0;
  let days = 0;
  while (days < 365 && (await world()).CurrentDay <= lastDay) {
    const r = await runWorldDay();
    if (r.pausedForYearEnd) break;
    simulatedFixtures += r.matches.simulated;
    failedFixtures += r.matches.failed;
    days++;
  }
  const end = await world();
  return {
    startDay: start.CurrentDay,
    currentDay: end.CurrentDay,
    currentDate: new Date(end.CurrentDate).toISOString(),
    simulatedFixtures,
    failedFixtures,
    simulatedDays: days,
  };
}
