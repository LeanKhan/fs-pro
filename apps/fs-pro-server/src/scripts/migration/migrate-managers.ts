import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '../../generated/prisma/client';
import { connect, connection } from 'mongoose';
import { Place } from '../../controllers/places/places.model';
import { Manager } from '../../controllers/managers/manager.model';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

async function migrateManagers() {
  console.log('Starting Managers migration...');

  // Connect to MongoDB
  await connect(process.env.DEV_MONGO_URL!);
  console.log('Connected to MongoDB');

  // Connect to PostgreSQL
  const prisma = new PrismaClient({
    adapter,
  });
  await prisma.$connect();
  console.log('Connected to PostgreSQL');

  // Register Place model first (required by Manager's populate hook)
  new Place();

  // Create Manager model directly (avoiding DB circular dependency)
  const ManagerModel = new Manager().model;

  // Fetch all managers from MongoDB
  const managers = await ManagerModel.find({}).lean().exec();
  console.log(`Found ${managers.length} managers to migrate`);

  // Migrate each manager
  for (const manager of managers) {
    try {
      console.log('Manager => ', manager._id.toString());

      await prisma.manager.create({
        data: {
          mongoId: manager._id.toString(), // Store original MongoDB ID
          Key: manager.Key,
          FirstName: manager.FirstName,
          LastName: manager.LastName,
          Age: manager.Age,
          Picture: manager.Picture || null,
          Club: manager.Club?.toString() || null,
          Nationality: manager.Nationality?._id.toString() || null,
          NationalTeam: manager.NationalTeam || false,
          Records: manager.Records || [],
          isEmployed: manager.isEmployed || false,
          createdAt: (manager as any).createdAt || new Date(),
          updatedAt: (manager as any).updatedAt || new Date(),
        },
      });
      console.log(`✓ Migrated: ${manager.FirstName} ${manager.LastName}`);
    } catch (err: any) {
      console.error(`✗ Failed: ${manager.FirstName} ${manager.LastName}`);
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

migrateManagers().catch(console.error);
