import * as dotenv from 'dotenv';
dotenv.config();

import { connect, connection } from 'mongoose';
import { Competition } from '../../controllers/competitions/competition.model';
import { createDrizzleConnection } from '../../db/drizzle/client';
import {
  competitionClubs as competitionClubsTable,
  competitions as competitionsTable,
  clubs as clubsTable,
} from '../../db/drizzle/schema';
import { loadIdMap, resolve } from './utils';

/**
 * Populates the CompetitionClubs join table from Mongo's
 * `Competition.Clubs` array - the many-to-many source of truth (a club's
 * own `League` FK, resolved directly in migrate-clubs.ts, only ever covers
 * its one primary league; a Cup/Tournament's member list is what needs the
 * join table). Run AFTER both migrate-competitions and migrate-clubs.
 */
async function migrateCompetitionClubs() {
  console.log('Starting CompetitionClubs migration...');

  await connect(process.env.DEV_MONGO_URL!);
  console.log('Connected to MongoDB');

  const { client, db } = createDrizzleConnection();
  await client`SELECT 1`;
  console.log('Connected to PostgreSQL');

  const CompetitionModel = new Competition().model;
  const competitions = await CompetitionModel.find({}).lean().exec();
  console.log(`Found ${competitions.length} competitions to link`);

  const [competitionsMap, clubsMap] = await Promise.all([
    loadIdMap(db, competitionsTable),
    loadIdMap(db, clubsTable),
  ]);

  for (const competition of competitions) {
    const competitionId = resolve(competitionsMap, competition._id.toString());
    if (!competitionId) {
      console.error(`✗ Skipped ${competition.Name}: not found in Postgres (run migrate-competitions first)`);
      continue;
    }

    for (const clubRef of competition.Clubs || []) {
      const clubId = resolve(clubsMap, (clubRef as any).toString());
      if (!clubId) {
        console.error(`✗ Skipped a club membership for ${competition.Name}: club not found in Postgres`);
        continue;
      }

      try {
        await db
          .insert(competitionClubsTable)
          .values({
            Competition: competitionId,
            Club: clubId,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoNothing();
      } catch (err: any) {
        console.error(`✗ Failed linking club to ${competition.Name}:`, err.message?.toString());
      }
    }
    console.log(`✓ Linked: ${competition.Name} (${(competition.Clubs || []).length} clubs)`);
  }

  console.log('Migration complete!');
  await connection.close();
  await client.end();
}

migrateCompetitionClubs().catch(console.error);
