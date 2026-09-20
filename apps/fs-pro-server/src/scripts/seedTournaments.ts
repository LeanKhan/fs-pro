import * as dotenv from 'dotenv';
dotenv.config();

import { TournamentEngineService } from '../services/competitions/tournament-engine.service';
import { getCompetitions } from '../controllers/competitions/competition.service';
import { DrizzleDatabase } from '../db/drizzle';
import { competitionClubs } from '../db/drizzle/schema';
import { eq } from 'drizzle-orm';

/** Creates the per-country cups and the continental competition, and syncs
 * their member lists. Pass the season Year (e.g. `2027`) to leave any
 * competition that already has a season for that year untouched. */
async function main() {
  const year = process.argv[2]?.trim().toUpperCase();
  console.log('Seeding tournaments...', year ? `(Year ${year})` : '');
  const res = await TournamentEngineService.seedDefaultTournaments(year);

  const comps = await getCompetitions();
  console.log(
    'Competitions in DB:',
    comps.map((c) => ({ code: c.CompetitionCode, name: c.Name, type: c.Type }))
  );

  const db = DrizzleDatabase.getInstance().database;
  for (const comp of [...res.cups, res.ccl]) {
    const members = await db
      .select()
      .from(competitionClubs)
      .where(eq(competitionClubs.CompetitionId, comp._id || comp.id));
    console.log(`${comp.CompetitionCode} club memberships: ${members.length}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Error seeding tournaments:', err);
  process.exit(1);
});
