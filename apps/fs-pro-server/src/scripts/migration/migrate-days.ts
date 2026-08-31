import * as dotenv from 'dotenv';
dotenv.config();

import { connect, connection } from 'mongoose';
import { Day } from '../../controllers/days/day.model';
import { createDrizzleConnection } from '../../db/drizzle/client';
import {
  days as daysTable,
  calendars as calendarsTable,
} from '../../db/drizzle/schema';
import { loadIdMap, resolve, upsertByMongoId } from './utils';

async function migrateDays() {
  console.log('Starting Days migration...');

  // Connect to MongoDB
  await connect(process.env.DEV_MONGO_URL!);
  console.log('Connected to MongoDB');

  // Connect to PostgreSQL
  const { client, db } = createDrizzleConnection();
  await client`SELECT 1`;
  console.log('Connected to PostgreSQL');

  // Create Day model directly (avoiding DB circular dependency)
  const DayModel = new Day().model;

  // Fetch all days from MongoDB
  const days = await DayModel.find({}).lean().exec();
  console.log(`Found ${days.length} days to migrate`);

  const calendarsMap = await loadIdMap(db, calendarsTable);

  // Migrate each day
  for (const day of days) {
    try {
      console.log('Day => ', day._id.toString());

      // Matches stays jsonb - it's an array of embedded subdocuments in
      // Mongo, not a separate collection, so its own Fixture/CompetitionId
      // refs stay as plain copied strings rather than resolved FKs.
      const matches = (day.Matches || []).map((match: any) => ({
        Fixture: match.Fixture?.toString() || null,
        MatchType: match.MatchType || null,
        Time: match.Time || null,
        Competition: match.Competition || null,
        FixtureIndex: match.FixtureIndex || null,
        CompetitionId: match.CompetitionId?.toString() || null,
        Played: match.Played || false,
        Week: match.Week || null,
      }));

      await upsertByMongoId(db, daysTable, {
        mongoId: day._id.toString(), // Store original MongoDB ID
        Matches: matches as any,
        isFree: day.isFree || false,
        Day: day.Day || null,
        Year: day.Year,
        Calendar: resolve(calendarsMap, day.Calendar),
        createdAt: (day as any).createdAt || new Date(),
        updatedAt: (day as any).updatedAt || new Date(),
      });
      console.log(`✓ Migrated: Day ${day.Day} - ${day.Year}`);
    } catch (err: any) {
      console.error(`✗ Failed: Day ${day.Day} - ${day.Year}`);
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

migrateDays().catch(console.error);
