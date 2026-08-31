import * as dotenv from 'dotenv';
dotenv.config();

import { connect, connection } from 'mongoose';
import { Season } from '../../controllers/seasons/season.model';
import { createDrizzleConnection } from '../../db/drizzle/client';
import {
  seasons as seasonsTable,
  clubs as clubsTable,
  calendars as calendarsTable,
  competitions as competitionsTable,
} from '../../db/drizzle/schema';
import { loadIdMap, resolve, upsertByMongoId } from './utils';

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

  const [clubsMap, calendarsMap, competitionsMap] = await Promise.all([
    loadIdMap(db, clubsTable),
    loadIdMap(db, calendarsTable),
    loadIdMap(db, competitionsTable),
  ]);

  // Migrate each season
  for (const season of seasons) {
    try {
      console.log('Season => ', season._id.toString());

      // Promoted/Relegated are now uuid[] columns (no FK on the elements -
      // see schema.ts), so each id has to resolve to a real club row.
      const promoted = (season.Promoted || [])
        .map((clubId: any) => resolve(clubsMap, clubId))
        .filter((id): id is string => id !== null);
      const relegated = (season.Relegated || [])
        .map((clubId: any) => resolve(clubsMap, clubId))
        .filter((id): id is string => id !== null);

      await upsertByMongoId(db, seasonsTable, {
        mongoId: season._id.toString(), // Store original MongoDB ID
        SeasonCode: season.SeasonCode,
        Title: season.Title,
        StartDate: season.StartDate || new Date(),
        EndDate: season.EndDate || new Date(),
        Winner: resolve(clubsMap, season.Winner),
        Promoted: promoted,
        Relegated: relegated,
        isFinished: season.isFinished || false,
        isStarted: season.isStarted || false,
        Status: season.Status || 'Pending',
        Year: season.Year || null,
        Calendar: resolve(calendarsMap, season.Calendar),
        Competition: resolve(competitionsMap, season.Competition),
        CompetitionCode: season.CompetitionCode,
        // Fixtures dropped - fixtures.Season (see migrate-fixtures.ts) is
        // the FK source of truth; a season's fixtures are a reverse
        // lookup now.
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
