/**
 * One-time (rerun-when-you-want-fresher-data) DB-touching script that
 * dumps a pool of real Clubs (with Players + resolved Manager tactic) to
 * a checked-in JSON fixture, so `simRealismCheck.ts` can run entirely
 * DB-free - see SIMULATION-IMPLEMENTATION-TRACKER.md's Milestone 1
 * acceptance criteria ("baseline output... repeatable... from the command
 * line", implicitly without depending on whatever happens to be in the
 * dev DB that day).
 *
 * This is deliberately the ONLY script in the simulation-baseline flow
 * that imports DB/club/manager services - keeping the DB touch physically
 * separate from simRealismCheck.ts makes "fully DB-free" a property of
 * the file split itself, not just a conditional branch that could bit-rot.
 *
 * Same prefetch shape App.setupGame()/matchSimWorker.ts already use for
 * DB-free simulation (clubs + a resolved tactic per club) - just captured
 * once to disk instead of per-run.
 *
 * Usage: DEV_TEST=true npx ts-node src/scripts/dumpSimulationRosterPool.ts
 */
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import DB from '../db';
import { getClubs } from '../controllers/clubs/club.service';
import { resolveManagerTactic } from '../controllers/managers/manager.service';
import { ClubInterface } from '../controllers/clubs/club.model';
import { ITactic } from '../simulation/state/PersistentState/Formations';

const OUTPUT_PATH = path.join(
  __dirname,
  'fixtures',
  'simulation-roster-pool.json'
);

async function main() {
  console.log('Connecting to database...');
  await DB.start();

  const clubs = (
    await getClubs(undefined, { withPlayersAndManager: true })
  ).filter((c: ClubInterface) => c.Players?.length >= 11);

  if (clubs.length < 2) {
    throw new Error(
      `Need at least 2 clubs with 11+ players to build a roster pool - found ${clubs.length}.`
    );
  }

  console.log(`Resolving manager tactics for ${clubs.length} clubs...`);

  const tactics: Record<string, ITactic> = {};
  for (const club of clubs) {
    const id = String(club._id);
    tactics[id] = await resolveManagerTactic(club.ManagerId);
  }

  // Same JSON round-trip matchQueue.ts does before crossing a worker_thread
  // boundary - strips anything non-plain-JSON down to data the runtime
  // script can load with a bare `require()`, no DB driver involved.
  const plainClubs = JSON.parse(JSON.stringify(clubs));

  const pool = {
    dumpedAt: new Date().toISOString(),
    clubs: plainClubs,
    tactics,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(pool, null, 2));
  console.log(
    `Wrote ${clubs.length} clubs + tactics to ${OUTPUT_PATH} (${(
      fs.statSync(OUTPUT_PATH).size / 1024
    ).toFixed(0)} KB).`
  );
}

main()
  .catch((err) => {
    console.error('\nRoster pool dump failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await DB.disconnect();
    process.exit(process.exitCode || 0);
  });
