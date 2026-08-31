import * as dotenv from 'dotenv';
dotenv.config();

import { connect, connection } from 'mongoose';
import { Place } from '../../controllers/places/places.model';
import { Competition } from '../../controllers/competitions/competition.model';
import { createDrizzleConnection } from '../../db/drizzle/client';
import { competitions as competitionsTable, places as placesTable } from '../../db/drizzle/schema';
import { loadIdMap, resolve } from './utils';

async function migrateCompetitions() {
  console.log('Starting Competitions migration...');

  // Connect to MongoDB
  await connect(process.env.DEV_MONGO_URL!);
  console.log('Connected to MongoDB');

  // Connect to PostgreSQL
  const { client, db } = createDrizzleConnection();
  await client`SELECT 1`;
  console.log('Connected to PostgreSQL');

  // Register Place model first (required by Competition's populate hook)
  new Place();

  // Create Competition model directly (avoiding DB circular dependency)
  const CompetitionModel = new Competition().model;

  // Fetch all competitions from MongoDB
  const competitions = await CompetitionModel.find({}).lean().exec();
  console.log(`Found ${competitions.length} competitions to migrate`);

  const placesMap = await loadIdMap(db, placesTable);

  // Migrate each competition
  for (const competition of competitions) {
    try {
      console.log('Competition => ', competition._id.toString());

      await db
        .insert(competitionsTable)
        .values({
          mongoId: competition._id.toString(), // Store original MongoDB ID
          Name: competition.Name,
          Type: competition.Type,
          CompetitionCode: competition.CompetitionCode,
          CompetitionID: competition.CompetitionID,
          League: competition.League || false,
          Tournament: competition.Tournament || false,
          Cup: competition.Cup || false,
          Division: competition.Division || 0,
          NumberOfTeams: competition.NumberOfTeams,
          NumberOfWeeks: competition.NumberOfWeeks,
          TeamsPromoted: competition.TeamsPromoted || null,
          TeamsRelegated: competition.TeamsRelegated || null,
          Country: resolve(placesMap, (competition.Country as any)?._id || competition.Country),
          // Clubs/Seasons dropped - see migrate-competition-clubs.ts (join
          // table) and seasons.Competition (reverse relation) respectively.
          createdAt: (competition as any).createdAt || new Date(),
          updatedAt: (competition as any).updatedAt || new Date(),
        });
      console.log(`✓ Migrated: ${competition.Name}`);
    } catch (err: any) {
      console.error(`✗ Failed: ${competition.Name}`);
      console.error('Full error object:', err);
      console.error('Error code:', err.code);
      console.error('Error meta:', err.meta);
      if (err instanceof Error) {
        console.error('Error message:', err.message.toString());
        console.error('Error stack:', err.stack?.toString());
      }
    }
  }

  console.log('Migration complete!');
  await connection.close();
  await client.end();
}

migrateCompetitions().catch(console.error);
