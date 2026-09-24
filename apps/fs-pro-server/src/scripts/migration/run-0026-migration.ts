import 'dotenv/config';
import { createDrizzleConnection } from '../../db/drizzle/client';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Running 0026 migration: club standing (fans, reputation, board confidence, form, morale, inbox)...');
  const { client } = createDrizzleConnection();

  try {
    const sqlPath = path.join(
      __dirname,
      '../../db/drizzle/migrations/0026_club_standing.sql'
    );
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    await client.unsafe(sqlContent);
    console.log('✅ Migration 0026 applied successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
    process.exit(0);
  }
}

main();
