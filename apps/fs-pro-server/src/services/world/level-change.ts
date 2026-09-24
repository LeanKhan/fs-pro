import { and, eq, gte, inArray } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars, clubs, levelHistory } from '../../db/drizzle/schema';
import { levelForXp, xpAfterLevelChange } from './level';

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
