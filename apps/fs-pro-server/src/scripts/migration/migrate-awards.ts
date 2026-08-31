import * as dotenv from 'dotenv';
dotenv.config();

import { connect, connection } from 'mongoose';
import { Award } from '../../controllers/awards/awards.model';
import { createDrizzleConnection } from '../../db/drizzle/client';
import {
  awards as awardsTable,
  clubs as clubsTable,
  seasons as seasonsTable,
  players as playersTable,
  managers as managersTable,
} from '../../db/drizzle/schema';
import { loadIdMap, resolve, upsertByMongoId } from './utils';

/**
 * Run LAST (see utils.ts) - needs clubs, seasons, players, AND managers
 * already migrated. `Recipient` is polymorphic in Mongo (a Player or
 * Manager id depending on `Type`, with no `ref` on the field itself), so
 * it's resolved against whichever of the two id maps `Type` points to.
 */
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

  const [clubsMap, seasonsMap, playersMap, managersMap] = await Promise.all([
    loadIdMap(db, clubsTable),
    loadIdMap(db, seasonsTable),
    loadIdMap(db, playersTable),
    loadIdMap(db, managersTable),
  ]);

  // Migrate each award
  for (const award of awards) {
    try {
      console.log('Award => ', award._id.toString());

      const recipientMap = award.Type === 'player' ? playersMap : managersMap;
      const recipient = resolve(recipientMap, award.Recipient);

      if (!recipient) {
        console.error(
          `✗ Skipped ${award.Name}: Recipient (${award.Type}) not found - run migrate-players/migrate-managers first`
        );
        continue;
      }

      await upsertByMongoId(db, awardsTable, {
        mongoId: award._id.toString(), // Store original MongoDB ID
        Name: award.Name,
        Type: award.Type,
        Period: award.Period,
        Category: award.Category,
        Recipient: recipient,
        Club: resolve(clubsMap, award.Club),
        Remarks: award.Remarks || null,
        Season: resolve(seasonsMap, award.Season),
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
