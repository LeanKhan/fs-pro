import * as dotenv from 'dotenv';
dotenv.config();

import { eq } from 'drizzle-orm';
import { connect, connection } from 'mongoose';
import { Fixture } from '../../controllers/fixtures/fixture.model';
import { createDrizzleConnection } from '../../db/drizzle/client';
import {
  fixtures as fixturesTable,
  seasons as seasonsTable,
  clubs as clubsTable,
  managers as managersTable,
} from '../../db/drizzle/schema';
import { loadIdMap, resolve } from './utils';

/**
 * Run AFTER migrate-seasons, migrate-clubs, and migrate-managers (see
 * utils.ts). `HomeSideDetails`/`AwaySideDetails` are left null here -
 * ClubMatchDetails doesn't exist yet at this point in the run order; they're
 * backfilled by migrate-club-matches.ts. `ReverseFixture` is a
 * self-reference, so it's resolved in a second pass below, once every
 * fixture in this batch has actually been inserted and has a real id.
 */
async function migrateFixtures() {
  console.log('Starting Fixtures migration...');

  await connect(process.env.DEV_MONGO_URL!);
  console.log('Connected to MongoDB');

  const { client, db } = createDrizzleConnection();
  await client`SELECT 1`;
  console.log('Connected to PostgreSQL');

  const FixtureModel = new Fixture().model;
  const fixtures = await FixtureModel.find({}).lean().exec();
  console.log(`Found ${fixtures.length} fixtures to migrate`);

  const [seasonsMap, clubsMap, managersMap] = await Promise.all([
    loadIdMap(db, seasonsTable),
    loadIdMap(db, clubsTable),
    loadIdMap(db, managersTable),
  ]);

  for (const fixture of fixtures) {
    try {
      console.log('Fixture => ', fixture._id.toString());

      await db.insert(fixturesTable).values({
        mongoId: fixture._id.toString(),
        Title: fixture.Title || null,
        FixtureCode: (fixture as any).FixtureCode || null,
        SeasonCode: fixture.SeasonCode || null,
        LeagueCode: fixture.LeagueCode || null,
        Week: fixture.Week || null,
        Season: resolve(seasonsMap, fixture.Season),
        Stadium: fixture.Stadium || null,
        Played: fixture.Played || false,
        Tie: (fixture as any).Tie || null,
        Stage: (fixture as any).Stage || 'lg-match',
        // ReverseFixture resolved in the second pass below.
        PlayedAt: fixture.PlayedAt || null,
        Home: fixture.Home || null,
        Away: fixture.Away || null,
        HomeTeam: resolve(clubsMap, fixture.HomeTeam),
        AwayTeam: resolve(clubsMap, fixture.AwayTeam),
        Details: (fixture.Details || null) as any,
        Events: (fixture.Events || []) as any,
        Type: fixture.Type || null,
        // HomeSideDetails/AwaySideDetails backfilled by migrate-club-matches.ts.
        HomeManager: resolve(managersMap, (fixture as any).HomeManager),
        AwayManager: resolve(managersMap, (fixture as any).AwayManager),
        isFinalMatch: (fixture as any).isFinalMatch || false,
        createdAt: (fixture as any).createdAt || new Date(),
        updatedAt: (fixture as any).updatedAt || new Date(),
      });
      console.log(`Migrated: ${fixture.Title || fixture._id.toString()}`);
    } catch (err: any) {
      console.error(`Failed: ${fixture.Title || fixture._id.toString()}`);
      console.error('Full error object:', err);
      console.error('Error code:', err.code);
      if (err instanceof Error) {
        console.error('Error message:', err.message.toString());
      }
    }
  }

  console.log('Backfilling ReverseFixture (self-reference)...');
  const fixturesMap = await loadIdMap(db, fixturesTable);
  for (const fixture of fixtures) {
    if (!fixture.ReverseFixture) continue;

    const reverseId = resolve(fixturesMap, fixture.ReverseFixture);
    if (!reverseId) continue;

    await db
      .update(fixturesTable)
      .set({ ReverseFixture: reverseId })
      .where(eq(fixturesTable.mongoId, fixture._id.toString()));
  }

  console.log('Migration complete!');
  await connection.close();
  await client.end();
}

migrateFixtures().catch(console.error);
