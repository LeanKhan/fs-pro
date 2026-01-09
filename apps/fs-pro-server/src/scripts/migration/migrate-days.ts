import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '../../generated/prisma/client';
import { connect, connection } from 'mongoose';
import { Day } from '../../controllers/days/day.model';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

async function migrateDays() {
  console.log('Starting Days migration...');

  // Connect to MongoDB
  await connect(process.env.DEV_MONGO_URL!);
  console.log('Connected to MongoDB');

  // Connect to PostgreSQL
  const prisma = new PrismaClient({
    adapter,
  });
  await prisma.$connect();
  console.log('Connected to PostgreSQL');

  // Create Day model directly (avoiding DB circular dependency)
  const DayModel = new Day().model;

  // Fetch all days from MongoDB
  const days = await DayModel.find({}).lean().exec();
  console.log(`Found ${days.length} days to migrate`);

  // Migrate each day
  for (const day of days) {
    try {
      console.log('Day => ', day._id.toString());

      // Convert Matches to handle ObjectId references
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

      await prisma.day.create({
        data: {
          mongoId: day._id.toString(), // Store original MongoDB ID
          Matches: matches as any,
          isFree: day.isFree || false,
          Day: day.Day || null,
          Year: day.Year,
          Calendar: day.Calendar?.toString() || null,
          createdAt: (day as any).createdAt || new Date(),
          updatedAt: (day as any).updatedAt || new Date(),
        },
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
  await prisma.$disconnect();
}

migrateDays().catch(console.error);
