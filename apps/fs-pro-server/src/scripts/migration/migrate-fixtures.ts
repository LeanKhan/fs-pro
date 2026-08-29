import * as dotenv from 'dotenv';
dotenv.config();

import { connect, connection } from 'mongoose';
import { Fixture } from '../../controllers/fixtures/fixture.model';
import { createDrizzleConnection } from '../../db/drizzle/client';
import { fixtures as fixturesTable } from '../../db/drizzle/schema';

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
        Season: fixture.Season?.toString() || null,
        Stadium: fixture.Stadium || null,
        Played: fixture.Played || false,
        Tie: (fixture as any).Tie || null,
        Stage: (fixture as any).Stage || 'lg-match',
        ReverseFixture: fixture.ReverseFixture?.toString() || null,
        PlayedAt: fixture.PlayedAt || null,
        Home: fixture.Home || null,
        Away: fixture.Away || null,
        HomeTeam: fixture.HomeTeam?.toString() || null,
        AwayTeam: fixture.AwayTeam?.toString() || null,
        Details: (fixture.Details || null) as any,
        Events: (fixture.Events || []) as any,
        Type: fixture.Type || null,
        HomeSideDetails: fixture.HomeSideDetails?.toString() || null,
        AwaySideDetails: fixture.AwaySideDetails?.toString() || null,
        HomeManager: (fixture as any).HomeManager?.toString() || null,
        AwayManager: (fixture as any).AwayManager?.toString() || null,
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

  console.log('Migration complete!');
  await connection.close();
  await client.end();
}

migrateFixtures().catch(console.error);
