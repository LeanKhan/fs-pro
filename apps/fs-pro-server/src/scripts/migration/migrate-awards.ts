import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '../../generated/prisma/client';
import { connect, connection } from 'mongoose';
import { Award } from '../../controllers/awards/awards.model';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

async function migrateAwards() {
  console.log('Starting Awards migration...');

  // Connect to MongoDB
  await connect(process.env.DEV_MONGO_URL!);
  console.log('Connected to MongoDB');

  // Connect to PostgreSQL
  const prisma = new PrismaClient({
    adapter,
  });
  await prisma.$connect();
  console.log('Connected to PostgreSQL');

  // Create Award model directly (avoiding DB circular dependency)
  const AwardModel = new Award().model;

  // Fetch all awards from MongoDB
  const awards = await AwardModel.find({}).lean().exec();
  console.log(`Found ${awards.length} awards to migrate`);

  // Migrate each award
  for (const award of awards) {
    try {
      console.log('Award => ', award._id.toString());
      await prisma.award.create({
        data: {
          mongoId: award._id.toString(), // Store original MongoDB ID
          Name: award.Name,
          Type: award.Type,
          Period: award.Period,
          Category: award.Category,
          Recipient: award.Recipient?.toString() || '',
          Club: award.Club?.toString() || null,
          Remarks: award.Remarks || null,
          Season: award.Season?.toString() || null,
          createdAt: (award as any).createdAt || new Date(),
          updatedAt: (award as any).updatedAt || new Date(),
        },
      });
      console.log(`✓ Migrated: ${award.Name}`);
    } catch (err: any) {
      console.error(`✗ Failed: ${award.Name}`);
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

migrateAwards().catch(console.error);
