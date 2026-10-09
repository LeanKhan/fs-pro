import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars, clubs, players } from '../../db/drizzle/schema';
import { GAME_TIME_SCALE } from '../play/game-time';

/**
 * Caretakers and release (docs/WORLD-PYRAMID-SPEC.md, "Caretaker and
 * release"). Most of 10,000 sign-ups stop playing, and their clubs still
 * hold town slots and pool places. So:
 *
 *  - every authenticated request marks the owner's clubs active (at most
 *    hourly per user, touchActivity);
 *  - a club whose owner has been away CaretakerAfterDays game days gets a
 *    caretaker: it keeps playing its fixtures with its saved team sheet
 *    (the match engine already skips unavailable players) and answers
 *    challenges like an AI club (ai-competitions.service.ts);
 *  - at year end, a club away for ReleaseAfterSeasons whole years is
 *    released: it leaves its town (freeing the slot for placement), the
 *    draws, matchmaking and the atlas, and its players become free agents.
 *
 * Away time counts in game days (DayLengthMinutes, sped up by
 * GAME_TIME_SCALE) so a fast dev world behaves like a real one.
 */

const db = () => DrizzleDatabase.getInstance().database;
type Calendar = typeof calendars.$inferSelect;

const TOUCH_EVERY_MS = 60 * 60_000;
const lastTouch = new Map<string, number>();

/** Real milliseconds in `days` game days. */
export function gameDaysMs(calendar: Pick<Calendar, 'DayLengthMinutes'>, days: number) {
  return (days * (calendar.DayLengthMinutes ?? 1440) * 60_000) / GAME_TIME_SCALE;
}

/** Mark a user's clubs active and lift any caretaker. Cheap to call on
 * every request: writes at most hourly per user per process. */
export async function touchActivity(userId: string) {
  const now = Date.now();
  if (now - (lastTouch.get(userId) ?? 0) < TOUCH_EVERY_MS) return;
  lastTouch.set(userId, now);
  if (lastTouch.size > 50_000) lastTouch.clear();
  await db()
    .update(clubs)
    .set({ LastActiveAt: new Date(now), Caretaker: false })
    .where(and(eq(clubs.UserId, userId), isNull(clubs.ReleasedAt)));
}

/** Express middleware: touch the session user's clubs, never blocking. */
export function activityMiddleware(req: { session?: unknown }, _res: unknown, next: () => void) {
  const userId = (req.session as { userID?: string } | undefined)?.userID;
  if (userId) touchActivity(userId).catch((err) => console.warn('[caretaker] touch failed', err));
  next();
}

/** Day start: give clubs whose owners are away a caretaker. */
export async function sweepCaretakers(calendar: Calendar) {
  const cutoff = new Date(Date.now() - gameDaysMs(calendar, calendar.CaretakerAfterDays ?? 14));
  const rows = await db()
    .update(clubs)
    .set({ Caretaker: true })
    .where(
      and(
        isNotNull(clubs.UserId),
        isNull(clubs.ReleasedAt),
        eq(clubs.Caretaker, false),
        or(isNull(clubs.LastActiveAt), lt(clubs.LastActiveAt, cutoff))
      )
    )
    .returning({ id: clubs.id });
  return { caretakers: rows.length };
}

/** Year end: release clubs whose owners have been away for
 * ReleaseAfterSeasons whole years. Returns the released club ids. */
export async function releaseInactiveClubs(calendar: Calendar): Promise<string[]> {
  const years = calendar.ReleaseAfterSeasons ?? 2;
  const cutoff = new Date(Date.now() - gameDaysMs(calendar, years * (calendar.YearLengthDays ?? 28)));
  const gone = await db()
    .update(clubs)
    // Migration 0038 renamed Clubs.TownId -> Clubs.DistrictId (WORLD-HIERARCHY-SPEC
    // §2.1/§2.3): releasing a club clears its district slot.
    .set({ ReleasedAt: new Date(), DistrictId: null, Caretaker: false, updatedAt: new Date() })
    .where(
      and(
        isNotNull(clubs.UserId),
        isNull(clubs.ReleasedAt),
        eq(clubs.Caretaker, true),
        or(isNull(clubs.LastActiveAt), lt(clubs.LastActiveAt, cutoff))
      )
    )
    .returning({ id: clubs.id });
  const ids = gone.map((c) => c.id);
  if (ids.length) {
    await db()
      .update(players)
      .set({ isSigned: false, ClubId: null, ClubCode: null, updatedAt: new Date() } as Partial<typeof players.$inferInsert>)
      .where(inArray(players.ClubId, ids));
    console.log(`[caretaker] released ${ids.length} long-inactive club(s)`);
  }
  return ids;
}

/** Clubs the AI answers for: AI clubs and human clubs with a caretaker. */
export const aiControlled = (club: { UserId: string | null; Caretaker?: boolean | null }) =>
  !club.UserId || !!club.Caretaker;

export const releasedCount = async () =>
  (await db().select({ n: sql<number>`count(*)::int` }).from(clubs).where(isNotNull(clubs.ReleasedAt)))[0]?.n ?? 0;
