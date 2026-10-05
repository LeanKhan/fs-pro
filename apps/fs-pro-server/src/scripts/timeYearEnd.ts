import 'dotenv/config';
import { DrizzleDatabase } from '../db/drizzle';
import { calendars } from '../db/drizzle/schema';
import { endYear } from '../services/world/year.service';

/**
 * Times one year end on a scratch world (e.g. after seedScaleWorld.ts):
 * marks the current year as over and runs endYear, which logs each step's
 * cost. Never point it at a real world: it ends the year.
 *
 *   DATABASE_URL=postgres://.../scratch npx ts-node --transpile-only src/scripts/timeYearEnd.ts
 */
async function main() {
  if (!/check|scratch|scale/i.test(process.env.DATABASE_URL ?? '')) throw new Error('Refusing: DATABASE_URL does not look like a scratch database');
  const db = DrizzleDatabase.getInstance().database;
  const [cal] = await db.select().from(calendars).limit(1);
  await db.update(calendars).set({ YearStartDay: cal!.CurrentDay - cal!.YearLengthDays, CurrentHour: 0 });
  const t = Date.now();
  const r = await endYear();
  console.log(`year end: ${Date.now() - t} ms`, JSON.stringify(r?.pyramids), r?.errors);
  process.exit(0);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
