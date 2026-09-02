import * as dotenv from 'dotenv';
dotenv.config();

import { eq } from 'drizzle-orm';
import { connect, connection } from 'mongoose';
import { Place } from '../../controllers/places/places.model';
import { Club } from '../../controllers/clubs/club.model';
import { createDrizzleConnection } from '../../db/drizzle/client';
import {
  clubs as clubsTable,
  managers as managersTable,
  competitions as competitionsTable,
  users as usersTable,
  places as placesTable,
} from '../../db/drizzle/schema';
import { loadIdMap, resolve, upsertByMongoId } from './utils';

/**
 * Run AFTER migrate-managers, migrate-competitions, and migrate-users (see
 * utils.ts for the full required order). Also closes the Club<->Manager
 * circular reference: migrate-managers.ts left every manager's `Club`
 * column null (clubs didn't exist yet), so once clubs exist here, this
 * backfills that column via an UPDATE pass at the end.
 */
async function migrateClubs() {
  console.log('Starting Clubs migration...');

  // Connect to MongoDB
  await connect(process.env.DEV_MONGO_URL!);
  console.log('Connected to MongoDB');

  // Connect to PostgreSQL
  const { client, db } = createDrizzleConnection();
  await client`SELECT 1`;
  console.log('Connected to PostgreSQL');

  // Register Place model first (required by Club's populate hook)
  new Place();

  // Create Club model directly (avoiding DB circular dependency)
  const ClubModel = new Club().model;

  // Fetch all clubs from MongoDB
  const clubs = await ClubModel.find({}).lean().exec();
  console.log(`Found ${clubs.length} clubs to migrate`);

  const [managersMap, competitionsMap, usersMap, placesMap] = await Promise.all(
    [
      loadIdMap(db, managersTable),
      loadIdMap(db, competitionsTable),
      loadIdMap(db, usersTable),
      loadIdMap(db, placesTable),
    ]
  );

  // Migrate each club
  for (const club of clubs) {
    try {
      console.log('Club => ', club._id.toString());

      // Address no longer carries Country - that's its own FK column now.
      let addressData: Record<string, unknown> | null = null;
      if (club.Address) {
        const { Country, ...rest } = club.Address as any;
        addressData = rest;
      }

      await upsertByMongoId(db, clubsTable, {
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
        Manager: resolve(managersMap, club.Manager),
        assets: club.assets ? (club.assets as any) : null,
        Stats: club.Stats ? (club.Stats as any) : null,
        Address: addressData ? (addressData as any) : null,
        AddressCountry: resolve(
          placesMap,
          (club.Address as any)?.Country?._id || (club.Address as any)?.Country
        ),
        Budget: club.Budget || null,
        Transactions: club.Transactions ? (club.Transactions as any) : null,
        Records: (club.Records || []) as any,
        Stadium: club.Stadium ? (club.Stadium as any) : null,
        LeagueCode: club.LeagueCode || null,
        League: resolve(competitionsMap, club.League),
        // Players dropped - players.Club (see migrate-players.ts) is the
        // FK source of truth now.
        User: resolve(usersMap, club.User),
        createdAt: (club as any).createdAt || new Date(),
        updatedAt: (club as any).updatedAt || new Date(),
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

  // Backfill managers.Club now that every club has been inserted, closing
  // the Club<->Manager cycle.
  console.log('Backfilling managers.Club...');
  const clubsMap = await loadIdMap(db, clubsTable);
  for (const club of clubs) {
    if (!club.Manager) continue;

    const managerId = resolve(managersMap, club.Manager);
    const clubId = resolve(clubsMap, club._id.toString());
    if (!managerId || !clubId) continue;

    await db
      .update(managersTable)
      .set({ Club: clubId })
      .where(eq(managersTable.mongoId, club.Manager.toString()));
  }

  console.log('Migration complete!');
  await connection.close();
  await client.end();
}

migrateClubs().catch(console.error);
