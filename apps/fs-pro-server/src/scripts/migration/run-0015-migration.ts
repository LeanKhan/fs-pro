import 'dotenv/config';
import { createDrizzleConnection } from '../../db/drizzle/client';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Running 0015 migration: Tactics, Fitness, Finances...');
  const { client } = createDrizzleConnection();

  try {
    const sqlPath = path.join(__dirname, '../../db/drizzle/migrations/0015_tactics_fitness_finances.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Run statements
    await client.unsafe(sqlContent);
    console.log('✅ Migration 0015 applied successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
    process.exit(0);
  }
}

main();
