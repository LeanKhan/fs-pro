import * as dotenv from 'dotenv';
dotenv.config();

import { connect, connection } from 'mongoose';
import { Player } from '../../controllers/players/player.model';
import { Place } from '../../controllers/places/places.model';
import { createDrizzleConnection } from '../../db/drizzle/client';
import { players as playersTable, clubs as clubsTable, places as placesTable } from '../../db/drizzle/schema';
import { loadIdMap, resolve } from './utils';

async function migratePlayers() {
  console.log('Starting Players migration...');

  await connect(process.env.DEV_MONGO_URL!);
  console.log('Connected to MongoDB');

  const { client, db } = createDrizzleConnection();
  await client`SELECT 1`;
  console.log('Connected to PostgreSQL');

  new Place();
  const PlayerModel = new Player().model;
  const players = await PlayerModel.find({}).lean().exec();
  console.log(`Found ${players.length} players to migrate`);

  const [clubsMap, placesMap] = await Promise.all([
    loadIdMap(db, clubsTable),
    loadIdMap(db, placesTable),
  ]);

  for (const player of players) {
    try {
      console.log('Player => ', player._id.toString());

      await db.insert(playersTable).values({
        mongoId: player._id.toString(),
        FirstName: player.FirstName,
        LastName: player.LastName,
        Nationality: resolve(placesMap, (player as any).Nationality?._id || (player as any).Nationality),
        Age: player.Age || null,
        PlayerID: player.PlayerID || null,
        Position: (player as any).Position || null,
        Role: player.Role || null,
        PositionNumber: (player as any).PositionNumber || null,
        Attributes: (player.Attributes || null) as any,
        Rating: player.Rating || null,
        ShirtNumber: player.ShirtNumber || null,
        Value: player.Value || null,
        Form: (player as any).Form || 6,
        isReserve: (player as any).isReserve || false,
        Appearance: ((player as any).Appearance || null) as any,
        TransferHistory: ((player as any).TransferHistory || []) as any,
        RatingsHistory: ((player as any).RatingsHistory || []) as any,
        isSigned: player.isSigned || false,
        ClubCode: player.ClubCode || null,
        Club: resolve(clubsMap, player.Club),
        createdAt: (player as any).createdAt || new Date(),
        updatedAt: (player as any).updatedAt || new Date(),
      });
      console.log(`Migrated: ${player.FirstName} ${player.LastName}`);
    } catch (err: any) {
      console.error(`Failed: ${player.FirstName} ${player.LastName}`);
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

migratePlayers().catch(console.error);
