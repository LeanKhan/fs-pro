/**
 * One-time setup: creates the Postgres sequences `utils/counter.ts` reads
 * via `nextval()` under `USE_DRIZZLE=true`, replacing the Mongo `counter`
 * collection. Not a Drizzle schema migration (sequences aren't part of
 * `schema.ts` - deliberately, so the existing table definitions don't need
 * to change) - just a one-off DB setup script, safe to re-run (uses
 * `IF NOT EXISTS`).
 *
 * Starting values were derived from the actual max existing id suffix in
 * each Postgres table (not the Mongo counter's stored `sequence_value`,
 * which was already known to be out of sync with reality for at least
 * Manager - see FUTURE-PLANS.md). `season_counter_seq` is the one
 * exception: `SeasonCode` doesn't follow an `S-NNNNNN` numeric pattern, so
 * there's no reliable Postgres-side signal - carried over from Mongo's
 * stored value instead (this counter also appears otherwise unused today:
 * `season.model.ts` has no `SeasonID` field for it to populate).
 */
import 'dotenv/config';
import { DrizzleDatabase } from '../../db/drizzle';

const SEQUENCES: { name: string; startWith: number }[] = [
  { name: 'player_counter_seq', startWith: 242 },
  { name: 'manager_counter_seq', startWith: 50 },
  { name: 'competition_counter_seq', startWith: 11 },
  { name: 'season_counter_seq', startWith: 47 },
];

async function main() {
  const dz = DrizzleDatabase.getInstance();
  await dz.start();
  const sql = dz.sql;

  for (const { name, startWith } of SEQUENCES) {
    await sql.unsafe(
      `CREATE SEQUENCE IF NOT EXISTS "${name}" START WITH ${startWith}`
    );
    console.log(`Ensured sequence ${name} (start ${startWith})`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
