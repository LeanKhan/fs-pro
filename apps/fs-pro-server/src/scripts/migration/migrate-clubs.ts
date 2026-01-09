import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '../../generated/prisma/client';
import { connect, connection } from 'mongoose';
import { Place } from '../../controllers/places/places.model';
import { Club } from '../../controllers/clubs/club.model';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

async function migrateClubs() {
  console.log('Starting Clubs migration...');

  // Connect to MongoDB
  await connect(process.env.DEV_MONGO_URL!);
  console.log('Connected to MongoDB');

  // Connect to PostgreSQL
  const prisma = new PrismaClient({
    adapter,
  });
  await prisma.$connect();
  console.log('Connected to PostgreSQL');

  // Register Place model first (required by Club's populate hook)
  new Place();

  // Create Club model directly (avoiding DB circular dependency)
  const ClubModel = new Club().model;

  // Fetch all clubs from MongoDB
  const clubs = await ClubModel.find({}).lean().exec();
  console.log(`Found ${clubs.length} clubs to migrate`);

  // Migrate each club
  for (const club of clubs) {
    try {
      console.log('Club => ', club._id.toString());

      // Convert Players array of ObjectIds to strings
      const playerIds = (club.Players || []).map((playerId: any) => playerId.toString());

      // Handle Address.Country ObjectId conversion
      let addressData = null;
      if (club.Address) {
        addressData = {
          ...club.Address,
          Country: club.Address.Country?._id?.toString() || club.Address.Country?.toString() || null,
        };
      }

      await prisma.club.create({
        data: {
          mongoId: club._id.toString(), // Store original MongoDB ID
          Name: club.Name,
          ClubCode: club.ClubCode,
          AttackingClass: club.AttackingClass || null,
          DefensiveClass: club.DefensiveClass || null,
          Rating: club.Rating || 0,
          GK_Rating: club.GK_Rating || 0,
          ATT_Rating: club.ATT_Rating || 0,
          DEF_Rating: club.DEF_Rating || 0,
          MID_Rating: club.MID_Rating || 0,
          Manager: club.Manager?.toString() || null,
          assets: club.assets ? (club.assets as any) : undefined,
          Stats: club.Stats ? (club.Stats as any) : undefined,
          Address: addressData ? (addressData as any) : undefined,
          Budget: club.Budget || null,
          Transactions: club.Transactions ? (club.Transactions as any) : undefined,
          Records: club.Records || [],
          Stadium: club.Stadium ? (club.Stadium as any) : undefined,
          LeagueCode: club.LeagueCode || null,
          League: club.League?.toString() || null,
          Players: playerIds,
          User: club.User?.toString() || null,
          createdAt: (club as any).createdAt || new Date(),
          updatedAt: (club as any).updatedAt || new Date(),
        },
      });
      console.log(`✓ Migrated: ${club.Name}`);
    } catch (err: any) {
      console.error(`✗ Failed: ${club.Name}`);
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

migrateClubs().catch(console.error);
