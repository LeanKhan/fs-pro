import 'dotenv/config';
import { createDrizzleConnection } from '../../db/drizzle/client';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Running 0036 migration: email auth...');
  const { client } = createDrizzleConnection();

  try {
    const sqlPath = path.join(
      __dirname,
      '../../db/drizzle/migrations/0036_email_auth.sql'
    );
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    await client.unsafe(sqlContent);
    console.log('✅ Migration 0036 applied successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
    process.exit(0);
  }
}

main();
