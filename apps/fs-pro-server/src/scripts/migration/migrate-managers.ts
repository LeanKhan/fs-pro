import * as dotenv from 'dotenv';
dotenv.config();

import { connect, connection } from 'mongoose';
import { Place } from '../../controllers/places/places.model';
import { Manager } from '../../controllers/managers/manager.model';
import { createDrizzleConnection } from '../../db/drizzle/client';
import {
  managers as managersTable,
  clubs as clubsTable,
  places as placesTable,
} from '../../db/drizzle/schema';
import { loadIdMap, resolve, upsertByMongoId } from './utils';

/**
 * Run BEFORE migrate-clubs (see utils.ts for the full required order).
 * Club<->Manager is a circular reference in Mongo (both sides store the
 * other's id) - since clubs haven't been migrated yet at this point, `Club`
 * is left null here and backfilled by migrate-clubs.ts once clubs exist.
 */
async function migrateManagers() {
  console.log('Starting Managers migration...');

  // Connect to MongoDB
  await connect(process.env.DEV_MONGO_URL!);
  console.log('Connected to MongoDB');

  // Connect to PostgreSQL
  const { client, db } = createDrizzleConnection();
  await client`SELECT 1`;
  console.log('Connected to PostgreSQL');

  // Register Place model first (required by Manager's populate hook)
  new Place();

  // Create Manager model directly (avoiding DB circular dependency)
  const ManagerModel = new Manager().model;

  // Fetch all managers from MongoDB
  const managers = await ManagerModel.find({}).lean().exec();
  console.log(`Found ${managers.length} managers to migrate`);

  const [placesMap, clubsMap] = await Promise.all([
    loadIdMap(db, placesTable),
    loadIdMap(db, clubsTable),
  ]);

  // Migrate each manager
  for (const manager of managers) {
    try {
      console.log('Manager => ', manager._id.toString());

      await upsertByMongoId(db, managersTable, {
        mongoId: manager._id.toString(), // Store original MongoDB ID
        Key: manager.Key,
        FirstName: manager.FirstName,
        LastName: manager.LastName,
        Age: manager.Age,
        Picture: manager.Picture || null,
        // Left null if clubs haven't been migrated yet - see migrate-clubs.ts's backfill pass.
        Club: resolve(clubsMap, manager.Club),
        Nationality: resolve(
          placesMap,
          (manager.Nationality as any)?._id || manager.Nationality
        ),
        NationalTeam: manager.NationalTeam || false,
        Records: (manager.Records || []) as any,
        isEmployed: manager.isEmployed || false,
        createdAt: (manager as any).createdAt || new Date(),
        updatedAt: (manager as any).updatedAt || new Date(),
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
  await client.end();
}

migrateManagers().catch(console.error);
