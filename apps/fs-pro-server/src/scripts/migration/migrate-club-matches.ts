import * as dotenv from 'dotenv';
dotenv.config();

import { connect, connection } from 'mongoose';
import { ClubMatchDetails } from '../../controllers/club-match/club-match.model';
import { createDrizzleConnection } from '../../db/drizzle/client';
import { clubMatchDetails as clubMatchDetailsTable } from '../../db/drizzle/schema';

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

  for (const clubMatch of clubMatches) {
    try {
      console.log('ClubMatchDetails => ', clubMatch._id.toString());

      await db.insert(clubMatchDetailsTable).values({
        mongoId: clubMatch._id.toString(),
        Club: clubMatch.Club?.toString() || null,
        Fixture: clubMatch.Fixture?.toString() || null,
        Possession: clubMatch.Possession || 0,
        Goals: clubMatch.Goals || 0,
        ShotsOnTarget: clubMatch.ShotsOnTarget || 0,
        ShotsOffTarget: clubMatch.ShotsOffTarget || 0,
        Fouls: clubMatch.Fouls || 0,
        YellowCards: clubMatch.YellowCards || 0,
        RedCards: clubMatch.RedCards || 0,
        Passes: clubMatch.Passes || 0,
        PlayerStats: (clubMatch.PlayerStats || []).map((playerStat: any) => playerStat.toString()),
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

  console.log('Migration complete!');
  await connection.close();
  await client.end();
}

migrateClubMatches().catch(console.error);
