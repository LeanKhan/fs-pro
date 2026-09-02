import * as dotenv from 'dotenv';
dotenv.config();

import { connect, connection } from 'mongoose';
import { PlayerMatchDetails } from '../../controllers/player-match/player-match.model';
import { ClubMatchDetails } from '../../controllers/club-match/club-match.model';
import { createDrizzleConnection } from '../../db/drizzle/client';
import {
  playerMatchDetails as playerMatchDetailsTable,
  players as playersTable,
  fixtures as fixturesTable,
  clubMatchDetails as clubMatchDetailsTable,
} from '../../db/drizzle/schema';
import { loadIdMap, resolve, upsertByMongoId } from './utils';

/**
 * Run AFTER migrate-players, migrate-fixtures, and migrate-club-matches.
 * `ClubMatchDetails` doesn't exist as a field on the Mongo
 * PlayerMatchDetails document (see schema.ts's comment on that column) - it
 * only exists as the *reverse* pointer, `ClubMatchDetails.PlayerStats`. So
 * the association is read from there: build a map of
 * playerMatchDetails-mongoId -> clubMatchDetails-mongoId first, then
 * resolve through it below.
 */
async function migratePlayerMatches() {
  console.log('Starting PlayerMatchDetails migration...');

  await connect(process.env.DEV_MONGO_URL!);
  console.log('Connected to MongoDB');

  const { client, db } = createDrizzleConnection();
  await client`SELECT 1`;
  console.log('Connected to PostgreSQL');

  const PlayerMatchDetailsModel = new PlayerMatchDetails().model;
  const playerMatches = await PlayerMatchDetailsModel.find({}).lean().exec();
  console.log(
    `Found ${playerMatches.length} player match detail records to migrate`
  );

  const ClubMatchDetailsModel = new ClubMatchDetails().model;
  const clubMatches = await ClubMatchDetailsModel.find({}).lean().exec();

  const playerMatchToClubMatchMongoId = new Map<string, string>();
  for (const clubMatch of clubMatches) {
    for (const playerStatId of clubMatch.PlayerStats || []) {
      playerMatchToClubMatchMongoId.set(
        (playerStatId as any).toString(),
        clubMatch._id.toString()
      );
    }
  }

  const [playersMap, fixturesMap, clubMatchesMap] = await Promise.all([
    loadIdMap(db, playersTable),
    loadIdMap(db, fixturesTable),
    loadIdMap(db, clubMatchDetailsTable),
  ]);

  for (const playerMatch of playerMatches) {
    try {
      console.log('PlayerMatchDetails => ', playerMatch._id.toString());

      const clubMatchMongoId = playerMatchToClubMatchMongoId.get(
        playerMatch._id.toString()
      );

      await upsertByMongoId(db, playerMatchDetailsTable, {
        mongoId: playerMatch._id.toString(),
        Player: resolve(playersMap, playerMatch.Player),
        Fixture: resolve(fixturesMap, playerMatch.Fixture),
        ClubMatchDetails: clubMatchMongoId
          ? resolve(clubMatchesMap, clubMatchMongoId)
          : null,
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
