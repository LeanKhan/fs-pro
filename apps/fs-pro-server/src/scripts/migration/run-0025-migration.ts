import 'dotenv/config';
import { createDrizzleConnection } from '../../db/drizzle/client';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Running 0025 migration: play loop (real-time upgrades, club XP, challenges)...');
  const { client } = createDrizzleConnection();

  try {
    const sqlPath = path.join(
      __dirname,
      '../../db/drizzle/migrations/0025_play_loop.sql'
    );
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    await client.unsafe(sqlContent);
    console.log('✅ Migration 0025 applied successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
    process.exit(0);
  }
}

main();
