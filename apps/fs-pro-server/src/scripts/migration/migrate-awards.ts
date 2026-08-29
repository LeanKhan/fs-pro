import * as dotenv from 'dotenv';
dotenv.config();

import { connect, connection } from 'mongoose';
import { Award } from '../../controllers/awards/awards.model';
import { createDrizzleConnection } from '../../db/drizzle/client';
import { awards as awardsTable } from '../../db/drizzle/schema';

async function migrateAwards() {
  console.log('Starting Awards migration...');

  // Connect to MongoDB
  await connect(process.env.DEV_MONGO_URL!);
  console.log('Connected to MongoDB');

  // Connect to PostgreSQL
  const { client, db } = createDrizzleConnection();
  await client`SELECT 1`;
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
      await db
        .insert(awardsTable)
        .values({
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
  await client.end();
}

migrateAwards().catch(console.error);
