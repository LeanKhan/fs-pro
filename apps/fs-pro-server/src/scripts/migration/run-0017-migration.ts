import 'dotenv/config';
import { createDrizzleConnection } from '../../db/drizzle/client';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Running 0017 migration: transfer window + TransferOffers...');
  const { client } = createDrizzleConnection();

  try {
    const sqlPath = path.join(
      __dirname,
      '../../db/drizzle/migrations/0017_transfer_window_offers.sql'
    );
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Idempotent (IF NOT EXISTS throughout) - safe to re-run.
    await client.unsafe(sqlContent);
    console.log('✅ Migration 0017 applied successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
    process.exit(0);
  }
}

main();
