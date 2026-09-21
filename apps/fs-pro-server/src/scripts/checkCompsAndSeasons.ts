import 'dotenv/config';
import { DrizzleDatabase } from '../db/drizzle';
import { competitions, seasons } from '../db/drizzle/schema';

async function main() {
  const db = DrizzleDatabase.getInstance().database;
  const comps = await db.select().from(competitions);
  console.log('Competitions:', comps.map(c => ({ id: c.id, code: c.CompetitionCode, name: c.Name, type: c.Type })));

  const allSeasons = await db.select().from(seasons);
  console.log('Seasons:', allSeasons.map(s => ({
    id: s.id,
    code: s.SeasonCode,
    year: s.Year,
    isStarted: s.isStarted,
    isFinished: s.isFinished,
    status: s.Status,
    winner: s.WinnerId
  })));

  process.exit(0);
}

main().catch(console.error);
