import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { and, eq, inArray, like } from 'drizzle-orm';
import { createDrizzleConnection } from '../../db/drizzle/client';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars, competitions, seasons } from '../../db/drizzle/schema';
import { backfillRegions } from '../../services/world/placement.service';
import { cancelEdition } from '../../services/competitions/edition.service';
import { drawAllPyramids, ensureAmateurCup } from '../../services/competitions/world-competitions.service';

/**
 * Moves a world onto the pyramid (docs/WORLD-PYRAMID-SPEC.md, "Migration"):
 *
 *  1. applies migration 0035 (idempotent SQL);
 *  2. gives every country regions, grouping its towns;
 *  3. archives the open-play national Open Leagues (NAT-*) and cancels their
 *     live editions, refunding fees;
 *  4. starts a new 28-day Year today (hour 0) with the new transfer windows;
 *  5. draws every country's pyramid league from today, and makes sure the
 *     Amateur Cup is running.
 *
 * Safe to run again: each step skips what's already done. `--dry` (once
 * 0035 is in; it reads the new columns) only
 * prints what it would do. Take a backup first (pg_dump), and count-check
 * after any restore.
 */

const dry = process.argv.includes('--dry');

async function main() {
  const { client } = createDrizzleConnection();
  if (!dry) {
    const sqlPath = path.join(__dirname, '../../db/drizzle/migrations/0035_world_pyramid.sql');
    await client.unsafe(fs.readFileSync(sqlPath, 'utf8'));
    console.log('0035 applied');
  }
  await client.end();

  const db = DrizzleDatabase.getInstance().database;

  if (!dry) {
    const r = await backfillRegions();
    console.log(`regions: ${r.regions} created, ${r.towns} towns placed in them`);
  }

  const old = await db.select().from(competitions).where(like(competitions.CompetitionCode, 'NAT-%'));
  const live = old.length
    ? await db
        .select()
        .from(seasons)
        .where(and(inArray(seasons.CompetitionId, old.map((c) => c.id)), inArray(seasons.Status, ['draft', 'registration', 'running'])))
    : [];
  console.log(`open leagues: ${old.length} to archive, ${live.length} live edition(s) to cancel`);
  if (!dry) {
    for (const s of live) await cancelEdition(s.id, 'Replaced by the national pyramid league');
    if (old.length) await db.update(competitions).set({ Archived: true, updatedAt: new Date() }).where(inArray(competitions.id, old.map((c) => c.id)));
  }

  const [cal] = await db.select().from(calendars).limit(1);
  if (!cal) throw new Error('No calendar row');
  console.log(`calendar: day ${cal.CurrentDay}, year ${cal.CurrentYear} (${cal.YearLengthDays} days from day ${cal.YearStartDay})`);
  if (!dry && (cal.YearLengthDays !== 28 || cal.CurrentHour !== 0)) {
    await db
      .update(calendars)
      .set({
        YearLengthDays: 28,
        YearStartDay: cal.CurrentDay,
        CurrentHour: 0,
        TransferWindows: [
          { fromDay: 1, toDay: 7 },
          { fromDay: 15, toDay: 18 },
        ],
        updatedAt: new Date(),
      })
      .where(eq(calendars.id, cal.id));
    console.log(`year ${cal.CurrentYear} now runs 28 days from day ${cal.CurrentDay}`);
  }

  if (!dry) {
    const drawn = await drawAllPyramids();
    for (const d of drawn) console.log(`pyramid ${d.competitionId}: ${d.clubs} clubs, ${d.divisions} division(s), ${d.pools} pool(s), ${d.fixtures} fixtures`);
    const cup = await ensureAmateurCup();
    console.log(`amateur cup ${cup.competitionId}${cup.created ? ' (created)' : ''}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
