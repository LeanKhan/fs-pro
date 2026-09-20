import * as dotenv from 'dotenv';
dotenv.config();

import { and, eq, gte, lt } from 'drizzle-orm';
import { DrizzleDatabase } from '../db/drizzle';
import { players } from '../db/drizzle/schema';
import { getSeasons } from '../controllers/seasons/season.service';
import { generateSeasonReport } from '../services/world/season-report.service';
import type { RetiredPlayerSummary } from '../controllers/players/player-lifecycle.service';

/**
 * Builds the season report for a cycle that ended before reports existed.
 *
 *   ts-node src/scripts/backfillSeasonReport.ts <Year> [--write]
 *
 * Champions, promotions/relegations and breakouts are rebuilt exactly from
 * stored data. Retirements are NOT recorded anywhere, so they are inferred:
 * players now retired whose row was last updated between the moment the
 * cycle's seasons finished and the moment the next cycle's seasons were
 * created. Without --write it only prints what it would store.
 */
async function main() {
  const year = process.argv[2]?.trim().toUpperCase();
  const write = process.argv.includes('--write');
  if (!year) throw new Error('Usage: backfillSeasonReport.ts <Year> [--write]');

  const cycle = await getSeasons({ Year: year });
  if (!cycle.length) throw new Error(`No seasons found for ${year}`);

  const finishedAt = new Date(
    Math.max(...cycle.map((s) => new Date(s.EndDate).getTime()))
  );
  const createdAt = (s: unknown) =>
    new Date((s as { createdAt: string }).createdAt).getTime();
  const later = (await getSeasons())
    .filter((s) => s.Year !== year && createdAt(s) > finishedAt.getTime())
    .map(createdAt);
  const nextCycleAt = later.length ? new Date(Math.min(...later)) : new Date();

  const db = DrizzleDatabase.getInstance().database;
  const rows = await db
    .select()
    .from(players)
    .where(
      and(
        eq(players.isRetired, true),
        gte(players.updatedAt, finishedAt),
        lt(players.updatedAt, nextCycleAt)
      )
    );

  // Retirement clears ClubCode, so the last club is unknown for these rows.
  const retired: RetiredPlayerSummary[] = rows.map((p) => ({
    playerId: p.id,
    name: `${p.FirstName} ${p.LastName}`,
    age: p.Age,
    position: p.Position,
    rating: p.Rating,
    clubCode: null,
  }));

  console.log(
    `${year}: cycle ended ${finishedAt.toISOString()}, next cycle ${nextCycleAt.toISOString()}`
  );
  console.log(`Inferred ${retired.length} retirement(s) in that window.`);

  if (!write) {
    console.log('Dry run - pass --write to store the report.');
    process.exit(0);
  }

  const report = await generateSeasonReport(year, { retired });
  console.log(
    `Stored report for ${year}: ${report.competitions.length} competitions, ` +
      `${report.movements.length} movements, ${report.retirements.length} retirements, ` +
      `${report.breakouts.length} breakouts, ${report.highlights.length} highlights.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
