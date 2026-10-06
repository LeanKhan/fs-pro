import 'dotenv/config';
import { createDrizzleConnection } from '../../db/drizzle/client';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Drops the scheduled-season columns and the CompetitionClubs table
 * (0031_drop_scheduled_seasons.sql). Refuses while any competition or season
 * has not been converted to open play. The one-off data script only exists
 * up to commit 9560529 (its schema still has the old columns), so run it
 * from a checkout of that commit, then run this script from here:
 *
 *   git worktree add /tmp/fs-pro-9560529 9560529
 *   cd /tmp/fs-pro-9560529 && npm install
 *   cd apps/fs-pro-server && npx ts-node src/scripts/migration/run-open-play-data.ts --apply
 */
async function main() {
  console.log('Running 0031 migration: drop scheduled-season leftovers...');
  const { client } = createDrizzleConnection();

  try {
    const [{ competitions }] = await client<{ competitions: number }[]>`
      SELECT count(*)::int AS competitions FROM "Competitions" WHERE "Stages" IS NULL`;
    const [{ seasons }] = await client<{ seasons: number }[]>`
      SELECT count(*)::int AS seasons FROM "Seasons" WHERE "EditionNumber" IS NULL`;
    if (competitions || seasons) {
      console.error(
        `❌ Refusing: ${competitions} competition(s) and ${seasons} season(s) are not converted to open play yet. ` +
          'Run the open-play data script first (see this file).'
      );
      process.exitCode = 1;
      return;
    }

    const sqlPath = path.join(
      __dirname,
      '../../db/drizzle/migrations/0031_drop_scheduled_seasons.sql'
    );
    await client.unsafe(fs.readFileSync(sqlPath, 'utf8'));
    console.log('✅ Migration 0031 applied successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
