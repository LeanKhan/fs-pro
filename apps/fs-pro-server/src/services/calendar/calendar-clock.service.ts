import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { dayKind } from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars } from '../../db/drizzle/schema';
import { getCalendar, updateCalendar } from '../../controllers/calendar/calendar.service';
import { runWorldDay, runWorldHour, type WorldDayReport } from '../world/world-day.service';
import { GAME_TIME_SCALE } from '../play/game-time';

/**
 * The live game clock (docs/WORLD-PYRAMID-SPEC.md, "Calendar"). While
 * ClockMode is 'live' the server moves the world on one game hour per tick
 * (services/world/world-day.service.ts runWorldHour: day start at hour 0,
 * the hour's kickoffs, day end after hour 23). A game day lasts
 * DayLengthMinutes real minutes (24 hours by default), so an hour lasts
 * DayLengthMinutes / 24, sped up by GAME_TIME_SCALE. Ticks are aligned to
 * whole hours of real time, so at the default speed game hour h kicks off
 * on a real hour boundary. Hours are never skipped: after downtime the
 * clock catches up one hour per poll.
 *
 * Multi-instance safe: a tick is claimed with a compare-and-set on
 * NextTickAt (which then acts as a short lease), so only one instance runs it.
 */

const POLL_MS = 15_000;
/** How long a claimed tick may run before another instance may take over. */
const LEASE_MS = 10 * 60_000;
/** Retry delay after a failed tick. */
const RETRY_MS = 5 * 60_000;

const MIN_DAY_MINUTES = 24;
const MAX_DAY_MINUTES = 60 * 24 * 14;

const db = () => DrizzleDatabase.getInstance().database;

export interface ClockState {
  mode: 'live' | 'paused';
  currentDay: number;
  currentDate: string;
  nextTickAt: string | null;
  lastTickAt: string | null;
  currentHour: number;
  dayLengthMinutes: number;
  dayKind: 'L' | 'C';
}

export interface TickResult {
  ran: boolean;
  /** What the game hour (or, for "advance now", the rest of the day) did. */
  report?: WorldDayReport;
  fromDay: number;
  toDay: number;
  simulatedFixtures: number;
  nextTickAt: string | null;
}

/** Real milliseconds in one game hour. */
export function hourMs(dayLengthMinutes: number) {
  return Math.max(1000, (dayLengthMinutes * 60_000) / 24 / GAME_TIME_SCALE);
}

/** The next whole game hour boundary after `from` (epoch-aligned). */
function nextBoundary(from: number, dayLengthMinutes: number) {
  const h = hourMs(dayLengthMinutes);
  return new Date(Math.floor(from / h) * h + h);
}

export async function getClockState(): Promise<ClockState> {
  const cal = await getCalendar();
  const [row] = await db().select().from(calendars).limit(1);
  return {
    mode: cal.ClockMode === 'live' ? 'live' : 'paused',
    currentDay: cal.CurrentDay,
    currentDate: new Date(cal.CurrentDate).toISOString(),
    nextTickAt: cal.NextTickAt ? new Date(cal.NextTickAt).toISOString() : null,
    lastTickAt: cal.LastTickAt ? new Date(cal.LastTickAt).toISOString() : null,
    currentHour: row?.CurrentHour ?? 0,
    dayLengthMinutes: row?.DayLengthMinutes ?? 1440,
    dayKind: row ? dayKind(row, row.CurrentDay) : 'L',
  };
}

export async function setClock(input: { mode?: 'live' | 'paused'; dayLengthMinutes?: number }): Promise<ClockState> {
  const [cal] = await db().select().from(calendars).limit(1);
  if (!cal) throw new Error('No calendar row: the game world has not been set up');
  const patch: Partial<typeof calendars.$inferInsert> = {};

  const dayLength =
    input.dayLengthMinutes !== undefined
      ? Math.min(MAX_DAY_MINUTES, Math.max(MIN_DAY_MINUTES, Math.round(input.dayLengthMinutes)))
      : cal.DayLengthMinutes;
  if (input.dayLengthMinutes !== undefined) patch.DayLengthMinutes = dayLength;
  if (input.mode) {
    patch.ClockMode = input.mode;
    // Resuming: the next whole hour, never an instant catch-up.
    if (input.mode === 'live' && cal.ClockMode !== 'live') patch.NextTickAt = nextBoundary(Date.now(), dayLength);
    if (input.mode === 'paused') patch.NextTickAt = null;
  }

  if (Object.keys(patch).length) {
    await db().update(calendars).set({ ...patch, updatedAt: new Date() }).where(eq(calendars.id, cal.id));
  }
  return getClockState();
}

/** Claims the tick (CAS on NextTickAt). Returns the hour it was due at, or
 * null if not due / lost the race. */
async function claimDueTick(): Promise<Date | null> {
  const now = new Date();
  const [before] = await db().select({ next: calendars.NextTickAt }).from(calendars).limit(1);
  const claimed = await db()
    .update(calendars)
    .set({ NextTickAt: new Date(now.getTime() + LEASE_MS), updatedAt: now })
    .where(
      and(
        eq(calendars.ClockMode, 'live'),
        or(isNull(calendars.NextTickAt), lte(calendars.NextTickAt, now))
      )
    )
    .returning({ id: calendars.id });
  return claimed.length ? (before?.next ?? now) : null;
}

async function performTick(kind: 'hour' | 'day', dueAt: Date | null): Promise<TickResult> {
  const before = await getCalendar();
  const fromDay = before.CurrentDay;
  const report = kind === 'hour' ? await runWorldHour() : await runWorldDay();
  const after = await getCalendar();
  const [row] = await db().select({ dayLength: calendars.DayLengthMinutes }).from(calendars).limit(1);

  if (report.pausedForYearEnd) {
    await updateCalendar({ LastTickAt: new Date(), NextTickAt: null });
    console.log(`[calendar-clock] day ${fromDay}: year is over and AutoRollover is off - clock paused`);
    return { ran: true, report, fromDay, toDay: fromDay, simulatedFixtures: 0, nextTickAt: null };
  }

  // The hour after the one that was due: behind schedule, that is already
  // past and the next poll catches up; on time, it's the next boundary.
  const dayLength = row?.dayLength ?? 1440;
  const nextTickAt =
    kind === 'hour' && dueAt ? new Date(dueAt.getTime() + hourMs(dayLength)) : nextBoundary(Date.now(), dayLength);
  await updateCalendar({ LastTickAt: new Date(), NextTickAt: nextTickAt });

  if (report.matches.simulated || report.advancedTo != null || report.hours[0] === 0) {
    console.log(
      `[calendar-clock] day ${fromDay} h${report.hours[0]}${report.hours[1] !== report.hours[0] ? `-${report.hours[1]}` : ''}: ` +
        `${report.matches.simulated} match(es)${report.yearEnded ? `, ${report.yearEnded.label} ended` : ''}` +
        `${report.advancedTo != null ? `, now day ${after.CurrentDay}` : ''}, next tick ${nextTickAt.toISOString()}`
    );
  }

  return {
    ran: true,
    report,
    fromDay,
    toDay: after.CurrentDay,
    simulatedFixtures: report.matches.simulated,
    nextTickAt: nextTickAt.toISOString(),
  };
}

/** Admin "advance now": plays out the rest of the current day immediately,
 * whatever the mode/timer. */
export async function tickNow(): Promise<TickResult> {
  const cal = await getCalendar();
  const wasLive = cal.ClockMode === 'live';
  if (wasLive) {
    // Take the lease so the scheduler doesn't double-run alongside us.
    await db()
      .update(calendars)
      .set({ NextTickAt: new Date(Date.now() + LEASE_MS) })
      .where(eq(calendars.ClockMode, 'live'));
  }
  try {
    const result = await performTick('day', null);
    if (!wasLive) await updateCalendar({ NextTickAt: null });
    return result;
  } catch (err) {
    if (wasLive) await updateCalendar({ NextTickAt: new Date() });
    throw err;
  }
}

let running = false;

async function pollOnce() {
  if (running) return;
  running = true;
  try {
    const dueAt = await claimDueTick();
    if (!dueAt) return;
    try {
      await performTick('hour', dueAt);
    } catch (err) {
      console.error('[calendar-clock] tick failed, retrying next slot check:', err);
      // Release the lease soon so a transient failure doesn't stall an hour.
      await updateCalendar({ NextTickAt: new Date(Date.now() + RETRY_MS) });
    }
  } catch (err) {
    console.error('[calendar-clock] poll error:', err);
  } finally {
    running = false;
  }
}

let timer: NodeJS.Timeout | null = null;

/** Starts the poller once per process. Harmless while ClockMode is 'paused'. */
export function startCalendarClock() {
  if (timer) return;
  timer = setInterval(() => void pollOnce(), POLL_MS);
  timer.unref();
  console.log('[calendar-clock] scheduler started');
}

export function stopCalendarClock() {
  if (timer) clearInterval(timer);
  timer = null;
}
