import * as dotenv from 'dotenv';
dotenv.config();

import { connect, connection } from 'mongoose';
import { PlayerMatchDetails } from '../../controllers/player-match/player-match.model';
import { createDrizzleConnection } from '../../db/drizzle/client';
import { playerMatchDetails as playerMatchDetailsTable } from '../../db/drizzle/schema';

async function migratePlayerMatches() {
  console.log('Starting PlayerMatchDetails migration...');

  await connect(process.env.DEV_MONGO_URL!);
  console.log('Connected to MongoDB');

  const { client, db } = createDrizzleConnection();
  await client`SELECT 1`;
  console.log('Connected to PostgreSQL');

  const PlayerMatchDetailsModel = new PlayerMatchDetails().model;
  const playerMatches = await PlayerMatchDetailsModel.find({}).lean().exec();
  console.log(`Found ${playerMatches.length} player match detail records to migrate`);

  for (const playerMatch of playerMatches) {
    try {
      console.log('PlayerMatchDetails => ', playerMatch._id.toString());

      await db.insert(playerMatchDetailsTable).values({
        mongoId: playerMatch._id.toString(),
        Player: playerMatch.Player?.toString() || null,
        Fixture: playerMatch.Fixture?.toString() || null,
        Goals: playerMatch.Goals || 0,
        Saves: playerMatch.Saves || 0,
        YellowCards: playerMatch.YellowCards || 0,
        Fouls: playerMatch.Fouls || 0,
        RedCards: playerMatch.RedCards || 0,
        Passes: playerMatch.Passes || 0,
        Tackles: playerMatch.Tackles || 0,
        Assists: playerMatch.Assists || 0,
        CleanSheets: playerMatch.CleanSheets || 0,
        Points: playerMatch.Points || 0,
        Dribbles: playerMatch.Dribbles || 0,
        Interceptions: playerMatch.Interceptions || 0,
        Form: playerMatch.Form || 0,
        createdAt: (playerMatch as any).createdAt || new Date(),
        updatedAt: (playerMatch as any).updatedAt || new Date(),
      });
      console.log(`Migrated: ${playerMatch._id.toString()}`);
    } catch (err: any) {
      console.error(`Failed: ${playerMatch._id.toString()}`);
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

migratePlayerMatches().catch(console.error);
