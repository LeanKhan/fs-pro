import { and, eq, gte, inArray, isNotNull, ne } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars, clubs, entries, levelHistory, ownerProgram } from '../../db/drizzle/schema';
import { levelForXp, xpAfterLevelChange } from './level';
// The existing mid-season join (L2). Imported statically even though it forms
// a cycle with pyramid.service.ts's `addXp`/`changeLevel` imports: both sides
// only use each other's functions at call time, and TS compiles the access to
// a late-bound property read, so the cycle is safe.
import { placeInPyramid } from '../competitions/world-competitions.service';

/**
 * Writing XP and Level changes (docs/OPEN-PLAY-COMPETITIONS-SPEC.md,
 * "Level"). Level is derived from Clubs.XP; every Level change is logged in
 * LevelHistory. All functions run inside the caller's transaction.
 */

type Db = DrizzleDatabase['database'];
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Promotions and relegations (any source) count toward "one per year". */
const MOVE_SOURCES = ['promotion', 'relegation', 'review'];

export async function setXp(
  tx: Tx,
  clubId: string,
  before: number,
  after: number,
  source: string,
  day: number,
  seasonId: string | null,
  thresholds: number[] | null
) {
  await tx
    .update(clubs)
    .set({ XP: after, updatedAt: new Date() })
    .where(eq(clubs.id, clubId));
  const from = levelForXp(before, thresholds ?? undefined);
  const to = levelForXp(after, thresholds ?? undefined);
  if (from !== to || source !== 'xp') {
    await tx.insert(levelHistory).values({
      ClubId: clubId,
      Day: day,
      FromLevel: from,
      ToLevel: to,
      XPBefore: before,
      XPAfter: after,
      Source: source,
      SeasonId: seasonId,
    });
  }
}

export async function addXp(
  tx: Tx,
  clubId: string,
  amount: number,
  day: number,
  seasonId: string | null,
  thresholds: number[] | null
) {
  const [club] = await tx
    .select({ XP: clubs.XP })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .for('update');
  if (!club || amount <= 0) return;
  await setXp(
    tx,
    clubId,
    club.XP,
    club.XP + amount,
    'xp',
    day,
    seasonId,
    thresholds
  );
}

/**
 * Promotion (+1) or relegation (-1) by setting XP to the Level threshold. At
 * most one move per club since `sinceDay` (default: the start of the current
 * year). Returns whether the club moved.
 */
export async function changeLevel(
  tx: Tx,
  clubId: string,
  change: 1 | -1,
  opts: {
    day: number;
    seasonId: string | null;
    calendar: typeof calendars.$inferSelect;
    sinceDay?: number;
    source?: 'promotion' | 'relegation' | 'review' | 'admin';
  }
): Promise<boolean> {
  const sinceDay = opts.sinceDay ?? opts.calendar.YearStartDay;
  const already = await tx
    .select({ id: levelHistory.id })
    .from(levelHistory)
    .where(
      and(
        eq(levelHistory.ClubId, clubId),
        inArray(levelHistory.Source, MOVE_SOURCES),
        gte(levelHistory.Day, sinceDay)
      )
    )
    .limit(1);
  if (already.length) return false;

  const [club] = await tx
    .select({ XP: clubs.XP })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .for('update');
  if (!club) return false;
  const after = xpAfterLevelChange(
    club.XP,
    change,
    opts.calendar.LevelThresholds ?? undefined
  );
  if (after === club.XP) return false;
  await setXp(
    tx,
    clubId,
    club.XP,
    after,
    opts.source ?? (change === 1 ? 'promotion' : 'relegation'),
    opts.day,
    opts.seasonId,
    opts.calendar.LevelThresholds
  );
  return true;
}

const db = () => DrizzleDatabase.getInstance().database;

/**
 * The Level-0 -> 1 pyramid trigger (L2; OWNER-PROGRAM-SPEC §7). A club joins
 * its country's pyramid the first time it reaches Level 1, not at founding.
 * Runs the existing mid-season join (`placeInPyramid`, which is itself
 * idempotent under the placement advisory lock and the
 * (SeasonId, ClubId) uniqueness), then marks the owner program `done`.
 *
 * Called after an XP write commits - from `payClub` (every match/reward path)
 * and from the owner program's step advance. Safe to call repeatedly and
 * concurrently: the entry insert is guarded and this update is conditional, so
 * N racing calls produce exactly one Entries row per club.
 *
 * Returns true when this call actually placed the club.
 */
export async function enterPyramidAtLevelOne(clubId: string): Promise<boolean> {
  const [club] = await db()
    .select({ xp: clubs.XP, countryId: clubs.AddressCountryId, releasedAt: clubs.ReleasedAt })
    .from(clubs)
    .where(eq(clubs.id, clubId));
  if (!club || club.releasedAt || !club.countryId) return false;
  if (levelForXp(club.xp) < 1) return false;

  // Idempotency keys on the real thing - a pyramid entry - not on the program
  // step: the `level1` step marks the program `done` itself, and a club that
  // reached Level 1 must still be placed exactly once. `placeInPyramid` and
  // the (SeasonId, ClubId) unique index are the second line of defence.
  const [placed] = await db()
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.ClubId, clubId), isNotNull(entries.Division)))
    .limit(1);
  if (placed) return false;

  await placeInPyramid(clubId, club.countryId);

  await db()
    .update(ownerProgram)
    .set({ Step: 'done', CompletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(ownerProgram.ClubId, clubId), ne(ownerProgram.Step, 'done')));
  return true;
}
