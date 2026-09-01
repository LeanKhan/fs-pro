/**
 * One-time setup: creates the `Sessions` table `sessionStore.ts`'s
 * `PgSessionStore` reads/writes under `USE_DRIZZLE=true`, replacing the
 * Mongo-backed `connect-mongodb-session` store. Not a Drizzle schema
 * migration (deliberately not in `schema.ts`, same reasoning as the
 * counter sequences in `setup-counter-sequences.ts`) - a plain, re-runnable
 * DB setup script (`IF NOT EXISTS`).
 */
import 'dotenv/config';
import { DrizzleDatabase } from '../../db/drizzle';

async function main() {
  const dz = DrizzleDatabase.getInstance();
  await dz.start();
  const sql = dz.sql;

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "Sessions" (
      sid TEXT PRIMARY KEY,
      session JSONB NOT NULL,
      expires TIMESTAMPTZ NOT NULL
    )
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS "Sessions_expires_idx" ON "Sessions" (expires)
  `);

  console.log('Ensured "Sessions" table and expires index');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
