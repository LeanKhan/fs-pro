import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '../../generated/prisma/client';
import { connect, connection } from 'mongoose';
import { User } from '../../controllers/user/user.model';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

async function migrateUsers() {
  console.log('Starting Users migration...');

  // Connect to MongoDB
  await connect(process.env.DEV_MONGO_URL!);
  console.log('Connected to MongoDB');

  // Connect to PostgreSQL
  const prisma = new PrismaClient({
    adapter,
  });
  await prisma.$connect();
  console.log('Connected to PostgreSQL');

  // Create User model directly (avoiding DB circular dependency)
  const UserModel = new User().model;

  // Fetch all users from MongoDB
  const users = await UserModel.find({}).lean().exec();
  console.log(`Found ${users.length} users to migrate`);

  // Migrate each user
  for (const user of users) {
    try {
      console.log('User => ', user._id.toString());

      // Convert Clubs array of ObjectIds to strings
      const clubIds = (user.Clubs || []).map((clubId: any) => clubId.toString());

      await prisma.user.create({
        data: {
          mongoId: user._id.toString(), // Store original MongoDB ID
          FullName: user.FullName,
          Password: user.Password, // Already hashed from MongoDB
          Age: user.Age || null,
          Username: user.Username,
          Avatar: user.Avatar || 'default-avatar.png',
          Alerts: user.Alerts || null,
          Clubs: clubIds,
          isAdmin: user.isAdmin || false,
          Session: user.Session || null,
          createdAt: (user as any).createdAt || new Date(),
          updatedAt: (user as any).updatedAt || new Date(),
        },
      });
      console.log(`✓ Migrated: ${user.Username}`);
    } catch (err: any) {
      console.error(`✗ Failed: ${user.Username}`);
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

migrateUsers().catch(console.error).then(() => console.log('complet.'));
