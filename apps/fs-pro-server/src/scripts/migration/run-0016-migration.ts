import 'dotenv/config';
import { createDrizzleConnection } from '../../db/drizzle/client';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Running 0016 migration: SeasonReports...');
  const { client } = createDrizzleConnection();

  try {
    const sqlPath = path.join(__dirname, '../../db/drizzle/migrations/0016_season_reports.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Idempotent (CREATE TABLE IF NOT EXISTS) - safe to re-run.
    await client.unsafe(sqlContent);
    console.log('✅ Migration 0016 applied successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
    process.exit(0);
  }
}

main();
