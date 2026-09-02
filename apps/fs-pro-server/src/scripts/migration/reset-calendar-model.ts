/**
 * Clean-slate reset for the Calendar/Season/Fixture/Day redesign (see
 * FUTURE-PLANS.md) - wipes every row of calendar/season/match history while
 * leaving Clubs/Players/Managers/Users/Competitions/Places untouched.
 * Deliberately NOT a data-reshaping migration: the old per-year Calendar/
 * Day.Matches model doesn't map cleanly onto the new singleton-Calendar/
 * Fixture.ScheduledDay model, and preserving that history wasn't worth
 * designing around - see the decision recorded in FUTURE-PLANS.md.
 *
 * Deletes children before parents (not a blanket CASCADE, so nothing outside
 * this list is ever swept up) - see the ordered list below. Fixtures'
 * HomeSideDetails/AwaySideDetails are nulled out first to break the circular
 * FK with ClubMatchDetails before either side is deleted.
 *
 * Defaults to --dry-run (row counts only, deletes nothing). Pass --apply to
 * actually delete.
 *
 * IMPORTANT run order:
 *   1. `ts-node src/scripts/migration/reset-calendar-model.ts --apply`
 *   2. `npm run drizzle:migrate` (applies the schema changes - safe now
 *      that the affected tables are empty)
 * The new singleton Calendar row is seeded automatically, the first time
 * anything calls `getCalendar()` - no separate seed step needed.
 *
 * Usage: DEV_TEST=true npx ts-node src/scripts/migration/reset-calendar-model.ts [--apply]
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { createDrizzleConnection } from '../../db/drizzle/client';

const PRESERVED_TABLES = [
  'Clubs',
  'Players',
  'Managers',
  'Users',
  'Competitions',
  'Places',
];

async function main() {
  const apply = process.argv.includes('--apply');

  const { client } = createDrizzleConnection();

  try {
    await client`SELECT 1`;

    console.log(
      apply
        ? 'Applying clean-slate reset...\n'
        : 'Dry run (pass --apply to actually delete):\n'
    );

    const preservedBefore = await countRows(client, PRESERVED_TABLES);

    const steps: { label: string; run: () => Promise<{ count?: number }> }[] = [
      {
        label: 'PlayerMatchDetails',
        run: () => client`DELETE FROM "PlayerMatchDetails"`,
      },
      {
        label: 'MatchReplays',
        run: () => client`DELETE FROM "MatchReplays"`,
      },
      {
        label: 'Awards',
        run: () => client`DELETE FROM "Awards"`,
      },
      {
        label:
          'Fixtures.HomeSideDetails/AwaySideDetails -> NULL (breaks the circular FK with ClubMatchDetails)',
        run: () =>
          client`UPDATE "Fixtures" SET "HomeSideDetails" = NULL, "AwaySideDetails" = NULL`,
      },
      {
        label: 'ClubMatchDetails',
        run: () => client`DELETE FROM "ClubMatchDetails"`,
      },
      {
        label: 'Fixtures',
        run: () => client`DELETE FROM "Fixtures"`,
      },
      {
        label: 'Seasons',
        run: () => client`DELETE FROM "Seasons"`,
      },
      {
        label: 'Days',
        run: () => client`DELETE FROM "Days"`,
      },
      {
        label: 'Calendars',
        run: () => client`DELETE FROM "Calendars"`,
      },
    ];

    for (const step of steps) {
      if (apply) {
        const result = await step.run();
        console.log(
          `  ${step.label}: ${(result as any).count ?? 0} row(s) affected`
        );
      } else {
        console.log(`  Would run: ${step.label}`);
      }
    }

    if (apply) {
      const remaining = await countRows(client, [
        'Calendars',
        'Days',
        'Seasons',
        'Fixtures',
        'ClubMatchDetails',
        'PlayerMatchDetails',
        'MatchReplays',
        'Awards',
      ]);
      console.log('\nRow counts after reset (should all be 0):');
      for (const [table, count] of Object.entries(remaining)) {
        console.log(`  ${table}: ${count}`);
      }
    }

    const preservedAfter = await countRows(client, PRESERVED_TABLES);
    console.log('\nPreserved tables (should be unchanged):');
    for (const table of PRESERVED_TABLES) {
      const before = preservedBefore[table];
      const after = preservedAfter[table];
      console.log(
        `  ${table}: ${before} -> ${after}${before !== after ? '  *** CHANGED ***' : ''}`
      );
    }

    if (!apply) {
      console.log(
        '\nDry run only - nothing was deleted. Re-run with --apply to actually delete.'
      );
    }
  } finally {
    await client.end();
  }
}

async function countRows(
  client: ReturnType<typeof createDrizzleConnection>['client'],
  tables: string[]
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const [{ count }] = await client.unsafe<{ count: string }[]>(
      `SELECT COUNT(*) as count FROM "${table}"`
    );
    counts[table] = Number(count);
  }
  return counts;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
