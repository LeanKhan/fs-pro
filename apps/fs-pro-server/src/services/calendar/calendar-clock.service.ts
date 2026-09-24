import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars } from '../../db/drizzle/schema';
import { getCalendar, updateCalendar } from '../../controllers/calendar/calendar.service';
import { runWorldDay, type WorldDayReport } from '../world/world-day.service';

/**
 * The live game clock. While ClockMode is 'live' the server itself moves the
 * world on one game day per tick (services/world/world-day.service.ts:
 * year end, editions, challenge expiry, transfer windows, the day's matches
 * via QuickSim, then the calendar +1 day). The next tick waits
 * MatchdaySlotMinutes after a day with matches, OffDaySlotMinutes after an
 * empty one. Days are never skipped. When the year is over and AutoRollover
 * is off, the day loop pauses the clock for the admin.
 *
 * Multi-instance safe: a tick is claimed with a compare-and-set on
 * NextTickAt (which then acts as a short lease), so only one instance runs it.
 */

const POLL_MS = 15_000;
/** How long a claimed tick may run before another instance may take over. */
const LEASE_MS = 10 * 60_000;
/** Retry delay after a failed tick. */
const RETRY_MS = 5 * 60_000;

const MIN_SLOT_MINUTES = 1;
const MAX_SLOT_MINUTES = 60 * 24 * 14;

const db = () => DrizzleDatabase.getInstance().database;

export interface ClockState {
  mode: 'live' | 'paused';
  currentDay: number;
  currentDate: string;
  nextTickAt: string | null;
  lastTickAt: string | null;
  matchdaySlotMinutes: number;
  offDaySlotMinutes: number;
}

export interface TickResult {
  ran: boolean;
  /** What the game day did (absent on older callers' types). */
  report?: WorldDayReport;
  fromDay: number;
  toDay: number;
  simulatedFixtures: number;
  nextTickAt: string | null;
}

export async function getClockState(): Promise<ClockState> {
  const cal = await getCalendar();
  return {
    mode: cal.ClockMode === 'live' ? 'live' : 'paused',
    currentDay: cal.CurrentDay,
    currentDate: new Date(cal.CurrentDate).toISOString(),
    nextTickAt: cal.NextTickAt ? new Date(cal.NextTickAt).toISOString() : null,
    lastTickAt: cal.LastTickAt ? new Date(cal.LastTickAt).toISOString() : null,
    matchdaySlotMinutes: cal.MatchdaySlotMinutes ?? 180,
    offDaySlotMinutes: cal.OffDaySlotMinutes ?? 10,
  };
}

const clampSlot = (n: number) =>
  Math.min(MAX_SLOT_MINUTES, Math.max(MIN_SLOT_MINUTES, Math.round(n)));

export async function setClock(input: {
  mode?: 'live' | 'paused';
  matchdaySlotMinutes?: number;
  offDaySlotMinutes?: number;
}): Promise<ClockState> {
  const cal = await getCalendar();
  const patch: Record<string, unknown> = {};

  if (input.matchdaySlotMinutes !== undefined) {
    patch.MatchdaySlotMinutes = clampSlot(input.matchdaySlotMinutes);
  }
  if (input.offDaySlotMinutes !== undefined) {
    patch.OffDaySlotMinutes = clampSlot(input.offDaySlotMinutes);
  }
  if (input.mode) {
    patch.ClockMode = input.mode;
    if (input.mode === 'live' && cal.ClockMode !== 'live') {
      // Resuming: a full matchday slot from now, never an instant catch-up.
      const matchday = (patch.MatchdaySlotMinutes as number) ?? cal.MatchdaySlotMinutes ?? 180;
      patch.NextTickAt = new Date(Date.now() + matchday * 60_000);
    }
    if (input.mode === 'paused') patch.NextTickAt = null;
  }

  if (Object.keys(patch).length) {
    await updateCalendar(patch as Partial<Awaited<ReturnType<typeof getCalendar>>>);
  }
  return getClockState();
}

/** Claims the tick (CAS on NextTickAt). Returns false if not due / lost the race. */
async function claimDueTick(): Promise<boolean> {
  const now = new Date();
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
  return claimed.length > 0;
}

async function performTick(): Promise<TickResult> {
  const before = await getCalendar();
  const fromDay = before.CurrentDay;
  const day = await runWorldDay();
  const after = await getCalendar();

  if (day.pausedForYearEnd) {
    await updateCalendar({ LastTickAt: new Date(), NextTickAt: null });
    console.log(`[calendar-clock] day ${fromDay}: year is over and AutoRollover is off - clock paused`);
    return { ran: true, report: day, fromDay, toDay: fromDay, simulatedFixtures: 0, nextTickAt: null };
  }

  const minutes =
    day.matches.total > 0 ? (before.MatchdaySlotMinutes ?? 180) : (before.OffDaySlotMinutes ?? 10);
  const nextTickAt = new Date(Date.now() + minutes * 60_000);
  await updateCalendar({ LastTickAt: new Date(), NextTickAt: nextTickAt });

  console.log(
    `[calendar-clock] day ${fromDay} -> ${after.CurrentDay}: ${day.matches.simulated} match(es)` +
      `${day.yearEnded ? `, ${day.yearEnded.label} ended` : ''}, next tick ${nextTickAt.toISOString()}`
  );

  return {
    ran: true,
    report: day,
    fromDay,
    toDay: after.CurrentDay,
    simulatedFixtures: day.matches.simulated,
    nextTickAt: nextTickAt.toISOString(),
  };
}

/** Admin "advance now": runs one tick immediately, whatever the mode/timer. */
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
    const result = await performTick();
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
    if (!(await claimDueTick())) return;
    try {
      await performTick();
    } catch (err) {
      console.error('[calendar-clock] tick failed, retrying next slot check:', err);
      // Release the lease soon so a transient failure doesn't stall a whole slot.
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
