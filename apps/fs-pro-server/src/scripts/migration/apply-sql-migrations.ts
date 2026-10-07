/**
 * Applies the hand-written migrations (0015 onwards) that drizzle's journal
 * doesn't know about - `drizzle-kit migrate` only runs the first 15, so a
 * fresh database would be missing most of its schema.
 *
 * Each file runs once, in name order, in its own transaction, and is
 * recorded in "SqlMigrations". Some of them hold data statements and drops,
 * so they must never run twice.
 *
 * An existing database whose migrations were already applied by hand (the
 * old run-00NN-migration.ts scripts) should be recorded once, without
 * running anything:
 *
 *   BASELINE=1 npx ts-node --transpile-only src/scripts/migration/apply-sql-migrations.ts
 *
 * Run it after `drizzle-kit migrate` (deploy/migrate.sh does both).
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';

const FIRST_UNJOURNALED = 15;
const dir = path.join(__dirname, '../../db/drizzle/migrations');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const baseline = process.env.BASELINE === '1';
  try {
    await sql`CREATE TABLE IF NOT EXISTS "SqlMigrations" (
      name text PRIMARY KEY,
      "appliedAt" timestamp(3) NOT NULL DEFAULT now()
    )`;
    const done = new Set((await sql<{ name: string }[]>`SELECT name FROM "SqlMigrations"`).map((r) => r.name));
    const files = fs
      .readdirSync(dir)
      .filter((f) => /^\d{4}_.+\.sql$/.test(f) && Number(f.slice(0, 4)) >= FIRST_UNJOURNALED)
      .sort();
    let ran = 0;
    for (const f of files) {
      if (done.has(f)) continue;
      if (baseline) {
        await sql`INSERT INTO "SqlMigrations" (name) VALUES (${f})`;
        console.log(`baselined ${f}`);
        continue;
      }
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(text);
        await tx`INSERT INTO "SqlMigrations" (name) VALUES (${f})`;
      });
      ran++;
      console.log(`applied ${f}`);
    }
    console.log(baseline ? 'Baseline recorded.' : ran ? `Applied ${ran} migration(s).` : 'SQL migrations up to date.');
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
