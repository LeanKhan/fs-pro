import { DrizzleDatabase } from '../../db/drizzle';
import { calendars } from '../../db/drizzle/schema';
import { eq } from 'drizzle-orm';
import { ensureFreeAgentMarketStock } from './foreign-intake.service';

/** Game days the window stays open after a new season cycle starts. */
export const WINDOW_DAYS_AFTER_CYCLE_START = 14;

export interface TransferWindowState {
  open: boolean;
  /** Last game day the window is open (null = no scheduled close). */
  closesDay: number | null;
  currentDay: number;
  daysLeft: number | null;
}

/**
 * The transfer window: purchases and bids are refused while it is closed.
 * One window per cycle - it opens when a cycle ends (off-season), and a new
 * cycle starting gives it a closing day WINDOW_DAYS_AFTER_CYCLE_START ahead;
 * an admin can also open or close it by hand. The state lives on the single
 * Calendar row (TransferWindowOpen / TransferWindowClosesDay); a window whose
 * closing day has passed counts as closed even before anything flips the flag.
 */
export async function getTransferWindow(): Promise<TransferWindowState> {
  const db = DrizzleDatabase.getInstance().database;
  const [row] = await db.select().from(calendars).limit(1);

  const currentDay = row?.CurrentDay ?? 0;
  const closesDay = row?.TransferWindowClosesDay ?? null;
  const open =
    (row?.TransferWindowOpen ?? false) &&
    (closesDay === null || currentDay <= closesDay);

  return {
    open,
    closesDay,
    currentDay,
    daysLeft: open && closesDay !== null ? closesDay - currentDay : null,
  };
}

async function writeWindow(open: boolean, closesDay: number | null) {
  const db = DrizzleDatabase.getInstance().database;
  const [row] = await db.select({ id: calendars.id }).from(calendars).limit(1);
  if (!row) throw new Error('No calendar exists yet');
  await db
    .update(calendars)
    .set({
      TransferWindowOpen: open,
      TransferWindowClosesDay: closesDay,
      updatedAt: new Date(),
    })
    .where(eq(calendars.id, row.id));
}

/** Opens the window; `days` from today it closes (omit for no scheduled close). */
export async function openTransferWindow(days?: number): Promise<TransferWindowState> {
  const { currentDay } = await getTransferWindow();
  await writeWindow(true, days === undefined ? null : currentDay + days);

  // Bring in fresh overseas arrivals if stock is low
  try {
    await ensureFreeAgentMarketStock();
  } catch (err) {
    console.error('[transfer-window] Failed to replenish market stock:', err);
  }

  return getTransferWindow();
}

export async function closeTransferWindow(): Promise<TransferWindowState> {
  await writeWindow(false, null);
  return getTransferWindow();
}

/** Called when a new season cycle starts: keep the window open, but set its close. */
export async function scheduleWindowCloseAfterCycleStart(): Promise<void> {
  const { currentDay } = await getTransferWindow();
  await writeWindow(true, currentDay + WINDOW_DAYS_AFTER_CYCLE_START);
}

export async function assertTransferWindowOpen(): Promise<void> {
  const window = await getTransferWindow();
  if (!window.open) {
    throw new Error('The transfer window is closed');
  }
}
