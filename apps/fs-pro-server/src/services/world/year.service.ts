import { and, eq } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars } from '../../db/drizzle/schema';
import { updateAllPlayerDetailsForYear } from '../../controllers/players/player.controller';
import { deductWagesForYear } from '../../controllers/transfers/transfer.service';
import {
  retireEligiblePlayersForYear,
  runYouthIntakeForYear,
  type RetiredPlayerSummary,
} from '../../controllers/players/player-lifecycle.service';
import { refreshAllClubsRatings } from '../../controllers/clubs/club.service';
import { generateYearReport } from './season-report.service';

/**
 * The open-play year (docs/OPEN-PLAY-COMPETITIONS-SPEC.md, "Year"): a fixed
 * run of `YearLengthDays` game days that only drives ageing, wages,
 * retirement, youth intake and the year report. It never creates or ends
 * competitions; editions run across the boundary.
 */

const db = () => DrizzleDatabase.getInstance().database;

/** Label used by the year-keyed player/wage/report code: "Y1", "Y2"... */
export const yearLabel = (n: number) => `Y${n}`;

export interface YearEndSummary {
  year: number;
  label: string;
  fromDay: number;
  toDay: number;
  retired: number;
  errors: string[];
}

/** True once the calendar has reached the day after the year's last day. */
export function yearIsOver(calendar: typeof calendars.$inferSelect) {
  return calendar.CurrentDay >= calendar.YearStartDay + calendar.YearLengthDays;
}

/**
 * End the current year and start the next one at today. Runs once per year:
 * the year number is claimed with a compare-and-set before anything else,
 * so a second call (another instance, a double click) does nothing and
 * returns null, as does ending a year that only started today. The year
 * covers YearStartDay .. today - 1; today's matches belong to the new year.
 *
 * Steps run in the same order as the old season-cycle end (players first,
 * wages before retirement, intake after, ratings last). A failing step is
 * logged and the rest still run; the year has already moved on.
 */
export async function endYear(): Promise<YearEndSummary | null> {
  const [calendar] = await db().select().from(calendars).limit(1);
  if (!calendar)
    throw new Error('No calendar row: the game world has not been set up');
  const year = calendar.CurrentYear;
  const today = calendar.CurrentDay;
  const range = { fromDay: calendar.YearStartDay, toDay: today - 1 };
  // A year that only started today has nothing to end (and a double click
  // on "End year now" must not end two years).
  if (today <= calendar.YearStartDay) return null;

  const claimed = await db()
    .update(calendars)
    .set({ CurrentYear: year + 1, YearStartDay: today, updatedAt: new Date() })
    .where(and(eq(calendars.id, calendar.id), eq(calendars.CurrentYear, year)))
    .returning({ id: calendars.id });
  if (!claimed.length) return null;

  const label = yearLabel(year);
  const errors: string[] = [];
  const step = async <T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<T | undefined> => {
    try {
      return await fn();
    } catch (err) {
      console.error(`[year] ${label}: ${name} failed`, err);
      errors.push(
        `${name}: ${err instanceof Error ? err.message : String(err)}`
      );
      return undefined;
    }
  };

  await step('player progression', () =>
    updateAllPlayerDetailsForYear(label, range)
  );
  await step('wages', () => deductWagesForYear(label));
  const retirement = await step('retirement', () =>
    retireEligiblePlayersForYear(label)
  );
  const retired: RetiredPlayerSummary[] = retirement?.retired ?? [];
  await step('youth intake', () => runYouthIntakeForYear(label));
  await step('club ratings', () => refreshAllClubsRatings());
  await step('year report', () =>
    generateYearReport(label, range, { retired })
  );

  console.log(
    `[year] ${label} ended (days ${range.fromDay}-${range.toDay}); year ${year + 1} starts on day ${today}.`
  );
  return {
    year,
    label,
    fromDay: range.fromDay,
    toDay: range.toDay,
    retired: retired.length,
    errors,
  };
}
