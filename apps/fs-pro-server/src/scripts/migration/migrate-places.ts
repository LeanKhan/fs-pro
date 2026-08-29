import * as dotenv from 'dotenv';
dotenv.config();

import { connect, connection } from 'mongoose';
import { Place } from '../../controllers/places/places.model';
import { createDrizzleConnection } from '../../db/drizzle/client';
import { places as placesTable } from '../../db/drizzle/schema';

async function migratePlaces() {
  console.log('Starting Places migration...');

  // Connect to MongoDB
  await connect(process.env.DEV_MONGO_URL!);
  console.log('Connected to MongoDB');

  // Connect to PostgreSQL
  const { client, db } = createDrizzleConnection();
  await client`SELECT 1`;
  console.log('Connected to PostgreSQL');

  // Create Place model directly (avoiding DB circular dependency)
  const PlaceModel = new Place().model;

  // Fetch all places from MongoDB
  const places = await PlaceModel.find({}).lean().exec();
  console.log(`Found ${places.length} places to migrate`);

  // Migrate each place
  for (const place of places) {
    try {
      console.log('Place => ', place._id.toString())
      await db
        .insert(placesTable)
        .values({
          mongoId: place._id.toString(), // Store original MongoDB ID
          Fullname: place.Fullname,
          Name: place.Name,
          Code: place.Code,
          Type: place.Type,
          Picture: place.Picture || null,
          Region: place.Region || null,
          createdAt: (place as any).createdAt || new Date(),
          updatedAt: (place as any).updatedAt || new Date(),
        });
      console.log(`✓ Migrated: ${place.Name}`);
    } catch (err: any) {
      console.error(`✗ Failed: ${place.Name}`);
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

migratePlaces().catch(console.error);
