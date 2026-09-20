import * as dotenv from 'dotenv';
dotenv.config();

import DB from '../db';
import { getUserById } from '../controllers/user/user.service';

async function main() {
  await DB.start();
  try {
    const u1 = await getUserById('ed5c9e68-ff2e-44e1-854c-e2be25560865');
    const u2 = await getUserById('bd5c1aea-f923-4104-becc-a4ddd28582cc');
    console.log('User 1:', u1);
    console.log('User 2:', u2);
  } catch (err) {
    console.error(err);
  } finally {
    await DB.disconnect();
    process.exit(0);
  }
}

main();
