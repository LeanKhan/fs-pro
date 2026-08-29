import * as dotenv from 'dotenv';
dotenv.config();

import { connect, connection } from 'mongoose';
import { Season } from '../../controllers/seasons/season.model';
import { createDrizzleConnection } from '../../db/drizzle/client';
import { seasons as seasonsTable } from '../../db/drizzle/schema';

async function migrateSeasons() {
  console.log('Starting Seasons migration...');

  // Connect to MongoDB
  await connect(process.env.DEV_MONGO_URL!);
  console.log('Connected to MongoDB');

  // Connect to PostgreSQL
  const { client, db } = createDrizzleConnection();
  await client`SELECT 1`;
  console.log('Connected to PostgreSQL');

  // Create Season model directly (avoiding DB circular dependency)
  const SeasonModel = new Season().model;

  // Fetch all seasons from MongoDB
  const seasons = await SeasonModel.find({}).lean().exec();
  console.log(`Found ${seasons.length} seasons to migrate`);

  // Migrate each season
  for (const season of seasons) {
    try {
      console.log('Season => ', season._id.toString());

      // Convert arrays of ObjectIds to strings
      const promoted = (season.Promoted || []).map((clubId: any) => clubId.toString());
      const relegated = (season.Relegated || []).map((clubId: any) => clubId.toString());
      const fixtures = (season.Fixtures || []).map((fixtureId: any) => fixtureId.toString());

      await db
        .insert(seasonsTable)
        .values({
          mongoId: season._id.toString(), // Store original MongoDB ID
          SeasonCode: season.SeasonCode,
          Title: season.Title,
          StartDate: season.StartDate || new Date(),
          EndDate: season.EndDate || new Date(),
          Winner: season.Winner?.toString() || null,
          Promoted: promoted,
          Relegated: relegated,
          isFinished: season.isFinished || false,
          isStarted: season.isStarted || false,
          Status: season.Status || 'Pending',
          Year: season.Year || null,
          Calendar: season.Calendar?.toString() || null,
          Competition: season.Competition?.toString() || null,
          CompetitionCode: season.CompetitionCode,
          Fixtures: fixtures,
          Standings: (season.Standings || []) as any,
          Logs: (season.Logs || []) as any,
          createdAt: (season as any).createdAt || new Date(),
          updatedAt: (season as any).updatedAt || new Date(),
        });
      console.log(`✓ Migrated: ${season.SeasonCode}`);
    } catch (err: any) {
      console.error(`✗ Failed: ${season.SeasonCode}`);
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

migrateSeasons().catch(console.error);
