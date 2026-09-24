import { initServer } from '@ts-rest/express';
import { eq } from 'drizzle-orm';
import {
  apiContract as contract,
  type WorldSettingsPatch,
} from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars } from '../../db/drizzle/schema';
import { tickNow } from '../../services/calendar/calendar-clock.service';
import { endYear } from '../../services/world/year.service';
import { accessDenied, isAdmin } from '../auth/club-access';

/** World settings and the open-play year (docs/OPEN-PLAY-COMPETITIONS-SPEC.md). */

const s = initServer();
const db = () => DrizzleDatabase.getInstance().database;
type Session = { userID?: string } | undefined;

async function settings() {
  const [c] = await db().select().from(calendars).limit(1);
  if (!c)
    throw new Error('No calendar row: the game world has not been set up');
  return {
    currentDay: c.CurrentDay,
    currentYear: c.CurrentYear,
    yearStartDay: c.YearStartDay,
    dayOfYear: c.CurrentDay - c.YearStartDay + 1,
    yearLengthDays: c.YearLengthDays,
    autoRollover: c.AutoRollover,
    transferWindows: c.TransferWindows,
    defaultRules: c.DefaultRules ?? null,
    levelThresholds: c.LevelThresholds ?? null,
    xpPerMatch: c.XPPerMatch ?? null,
    levelTargets: c.LevelTargets ?? null,
    levelReview: c.LevelReview ?? null,
    maxConcurrentEntries: c.MaxConcurrentEntries,
  };
}

const bad = (message: string) => ({
  status: 400 as const,
  body: { success: false as const, message },
});

export const worldTsRestRoutes = s.router(contract.world, {
  getSettings: async () => {
    try {
      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: 'World settings',
          payload: await settings(),
        },
      };
    } catch (err) {
      return bad(err instanceof Error ? err.message : String(err));
    }
  },

  updateSettings: async ({ body, req }) => {
    const access = await isAdmin(req.session as Session);
    if (access !== 'ok') return accessDenied(access);
    try {
      const current = await settings();
      const patch = body as WorldSettingsPatch;
      const length = patch.yearLengthDays ?? current.yearLengthDays;
      const windows = patch.transferWindows ?? current.transferWindows;
      if (windows.some((w) => w.toDay > length)) {
        return bad(`Transfer windows must fit in the ${length}-day year`);
      }

      const [c] = await db()
        .select({ id: calendars.id })
        .from(calendars)
        .limit(1);
      await db()
        .update(calendars)
        .set({
          ...(patch.yearLengthDays !== undefined && {
            YearLengthDays: patch.yearLengthDays,
          }),
          ...(patch.autoRollover !== undefined && {
            AutoRollover: patch.autoRollover,
          }),
          ...(patch.transferWindows !== undefined && {
            TransferWindows: patch.transferWindows,
          }),
          ...(patch.defaultRules !== undefined && {
            DefaultRules: patch.defaultRules,
          }),
          ...(patch.levelThresholds !== undefined && {
            LevelThresholds: patch.levelThresholds,
          }),
          ...(patch.xpPerMatch !== undefined && {
            XPPerMatch: patch.xpPerMatch,
          }),
          ...(patch.levelTargets !== undefined && {
            LevelTargets: patch.levelTargets,
          }),
          ...(patch.levelReview !== undefined && {
            LevelReview: patch.levelReview,
          }),
          ...(patch.maxConcurrentEntries !== undefined && {
            MaxConcurrentEntries: patch.maxConcurrentEntries,
          }),
          updatedAt: new Date(),
        })
        .where(eq(calendars.id, c!.id));
      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: 'World settings saved',
          payload: await settings(),
        },
      };
    } catch (err) {
      return bad(err instanceof Error ? err.message : String(err));
    }
  },

  endYear: async ({ req }) => {
    const access = await isAdmin(req.session as Session);
    if (access !== 'ok') return accessDenied(access);
    try {
      const summary = await endYear();
      if (!summary) {
        return {
          status: 409 as const,
          body: {
            success: false as const,
            message: 'The year was already ended',
          },
        };
      }
      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: `${summary.label} ended`,
          payload: summary,
        },
      };
    } catch (err) {
      return bad(err instanceof Error ? err.message : String(err));
    }
  },

  advanceDay: async ({ req }) => {
    const access = await isAdmin(req.session as Session);
    if (access !== 'ok') return accessDenied(access);
    try {
      const result = await tickNow();
      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: `Day ${result.fromDay} done`,
          payload: result.report!,
        },
      };
    } catch (err) {
      return bad(err instanceof Error ? err.message : String(err));
    }
  },
});
