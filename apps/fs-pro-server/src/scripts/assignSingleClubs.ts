import * as dotenv from 'dotenv';
dotenv.config();

import DB from '../db';
import { updateClubFields, getClubs } from '../controllers/clubs/club.service';

const EMMANUEL_USER_ID = 'bd5c1aea-f923-4104-becc-a4ddd28582cc';
const ROYAL_PHILAMENTIA_ID = '36a7e771-3789-4d7d-9d6d-01eb6c17276f';

const TOBILOBA_USER_ID = 'ed5c9e68-ff2e-44e1-854c-e2be25560865';
const SUNNY_CITY_ID = '9dd8d817-e5e2-4d62-9a16-b6019f10144c';

async function main() {
  await DB.start();
  try {
    const clubs = await getClubs({});
    console.log(`Processing ${clubs.length} clubs...`);

    let emmanuelKept = 0;
    let emmanuelReleased = 0;
    let tobilobaKept = 0;
    let tobilobaReleased = 0;

    for (const club of clubs) {
      if (!club._id) continue;

      if (club.UserId === EMMANUEL_USER_ID) {
        if (club._id === ROYAL_PHILAMENTIA_ID) {
          emmanuelKept++;
          console.log(`[KEEP] Emmanuel -> ${club.Name} (${club.ClubCode})`);
        } else {
          await updateClubFields(club._id, { UserId: null as any });
          emmanuelReleased++;
          console.log(`[RELEASED to Autonomous] ${club.Name} (${club.ClubCode})`);
        }
      } else if (club.UserId === TOBILOBA_USER_ID) {
        if (club._id === SUNNY_CITY_ID) {
          tobilobaKept++;
          console.log(`[KEEP] Tobiloba -> ${club.Name} (${club.ClubCode})`);
        } else {
          await updateClubFields(club._id, { UserId: null as any });
          tobilobaReleased++;
          console.log(`[RELEASED to Autonomous] ${club.Name} (${club.ClubCode})`);
        }
      }
    }

    console.log(`\nDone!`);
    console.log(`Emmanuel: 1 kept (Royal Philamentia), ${emmanuelReleased} released to autonomous.`);
    console.log(`Tobiloba: 1 kept (Sunny City), ${tobilobaReleased} released to autonomous.`);
  } catch (err) {
    console.error('Error updating clubs:', err);
  } finally {
    await DB.disconnect();
    process.exit(0);
  }
}

main();
