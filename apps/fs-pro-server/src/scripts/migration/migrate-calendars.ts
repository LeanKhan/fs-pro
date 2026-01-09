import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '../../generated/prisma/client';
import { connect, connection } from 'mongoose';
import { Calendar } from '../../controllers/calendar/calendar.model';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

async function migrateCalendars() {
  console.log('Starting Calendars migration...');

  // Connect to MongoDB
  await connect(process.env.DEV_MONGO_URL!);
  console.log('Connected to MongoDB');

  // Connect to PostgreSQL
  const prisma = new PrismaClient({
    adapter,
  });
  await prisma.$connect();
  console.log('Connected to PostgreSQL');

  // Create Calendar model directly (avoiding DB circular dependency)
  const CalendarModel = new Calendar().model;

  // Fetch all calendars from MongoDB
  const calendars = await CalendarModel.find({}).lean().exec();
  console.log(`Found ${calendars.length} calendars to migrate`);

  // Migrate each calendar
  for (const calendar of calendars) {
    try {
      console.log('Calendar => ', calendar._id.toString());

      // Convert Days array of ObjectIds to strings
      const dayIds = (calendar.Days || []).map((dayId: any) => dayId.toString());

      await prisma.calendar.create({
        data: {
          mongoId: calendar._id.toString(), // Store original MongoDB ID
          Name: calendar.Name,
          YearString: calendar.YearString,
          YearDigits: calendar.YearDigits,
          CurrentDay: calendar.CurrentDay || null,
          isActive: calendar.isActive || false,
          isEnded: calendar.isEnded || false,
          allSeasonsCompleted: calendar.allSeasonsCompleted || false,
          Days: dayIds,
          createdAt: (calendar as any).createdAt || new Date(),
          updatedAt: (calendar as any).updatedAt || new Date(),
        },
      });
      console.log(`✓ Migrated: ${calendar.Name}`);
    } catch (err: any) {
      console.error(`✗ Failed: ${calendar.Name}`);
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

migrateCalendars().catch(console.error);
