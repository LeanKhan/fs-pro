import * as dotenv from 'dotenv';
dotenv.config();

import { eq } from 'drizzle-orm';
import { connect, connection } from 'mongoose';
import { ClubMatchDetails } from '../../controllers/club-match/club-match.model';
import { Fixture } from '../../controllers/fixtures/fixture.model';
import { createDrizzleConnection } from '../../db/drizzle/client';
import {
  clubMatchDetails as clubMatchDetailsTable,
  clubs as clubsTable,
  fixtures as fixturesTable,
} from '../../db/drizzle/schema';
import { loadIdMap, resolve } from './utils';

/**
 * Run AFTER migrate-clubs and migrate-fixtures. Also closes the
 * Fixture<->ClubMatchDetails circular reference: migrate-fixtures.ts left
 * `HomeSideDetails`/`AwaySideDetails` null (this table didn't exist yet),
 * so once club-match rows exist here, this backfills those columns via an
 * UPDATE pass at the end, reading the association back off the Fixture
 * documents in Mongo.
 */
async function migrateClubMatches() {
  console.log('Starting ClubMatchDetails migration...');

  await connect(process.env.DEV_MONGO_URL!);
  console.log('Connected to MongoDB');

  const { client, db } = createDrizzleConnection();
  await client`SELECT 1`;
  console.log('Connected to PostgreSQL');

  const ClubMatchDetailsModel = new ClubMatchDetails().model;
  const clubMatches = await ClubMatchDetailsModel.find({}).lean().exec();
  console.log(`Found ${clubMatches.length} club match detail records to migrate`);

  const [clubsMap, fixturesMap] = await Promise.all([
    loadIdMap(db, clubsTable),
    loadIdMap(db, fixturesTable),
  ]);

  for (const clubMatch of clubMatches) {
    try {
      console.log('ClubMatchDetails => ', clubMatch._id.toString());

      await db.insert(clubMatchDetailsTable).values({
        mongoId: clubMatch._id.toString(),
        Club: resolve(clubsMap, clubMatch.Club),
        Fixture: resolve(fixturesMap, clubMatch.Fixture),
        Possession: clubMatch.Possession || 0,
        Goals: clubMatch.Goals || 0,
        ShotsOnTarget: clubMatch.ShotsOnTarget || 0,
        ShotsOffTarget: clubMatch.ShotsOffTarget || 0,
        Fouls: clubMatch.Fouls || 0,
        YellowCards: clubMatch.YellowCards || 0,
        RedCards: clubMatch.RedCards || 0,
        Passes: clubMatch.Passes || 0,
        // PlayerStats dropped - playerMatchDetails.ClubMatchDetails (see
        // migrate-player-matches.ts) is the FK source of truth now.
        Won: clubMatch.Won || false,
        Drew: clubMatch.Drew || false,
        Events: (clubMatch.Events || []) as any,
        createdAt: (clubMatch as any).createdAt || new Date(),
        updatedAt: (clubMatch as any).updatedAt || new Date(),
      });
      console.log(`Migrated: ${clubMatch._id.toString()}`);
    } catch (err: any) {
      console.error(`Failed: ${clubMatch._id.toString()}`);
      console.error('Full error object:', err);
      console.error('Error code:', err.code);
      if (err instanceof Error) {
        console.error('Error message:', err.message.toString());
      }
    }
  }

  console.log('Backfilling fixtures.HomeSideDetails/AwaySideDetails...');
  const clubMatchesMap = await loadIdMap(db, clubMatchDetailsTable);
  const FixtureModel = new Fixture().model;
  const fixtures = await FixtureModel.find({}).lean().exec();

  for (const fixture of fixtures) {
    const homeSideDetails = resolve(clubMatchesMap, (fixture as any).HomeSideDetails);
    const awaySideDetails = resolve(clubMatchesMap, (fixture as any).AwaySideDetails);
    if (!homeSideDetails && !awaySideDetails) continue;

    await db
      .update(fixturesTable)
      .set({
        ...(homeSideDetails ? { HomeSideDetails: homeSideDetails } : {}),
        ...(awaySideDetails ? { AwaySideDetails: awaySideDetails } : {}),
      })
      .where(eq(fixturesTable.mongoId, fixture._id.toString()));
  }

  console.log('Migration complete!');
  await connection.close();
  await client.end();
}

migrateClubMatches().catch(console.error);
