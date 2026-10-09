import 'dotenv/config';
import assert from 'assert';
import { eq, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../db/drizzle';
import { places } from '../db/drizzle/schema';
import {
  TARGET_FREE_AGENTS,
  TARGET_FREE_MANAGERS,
  freeAgentHistogram,
  freeAgentManagerCount,
  freeAgentPlayerCount,
  managerHistogram,
  seedFreeAgentMarket,
} from '../services/world/world-seed.service';

/**
 * Phase-2 B2-2C world-seed check (L5). Runs the idempotent seed twice on a
 * scratch database and proves it reaches exactly 5,000 free-agent players and
 * 1,000 free managers, printing the generated histograms.
 *
 *   DATABASE_URL=postgres://fspro:...@localhost:5434/fspro_p2c_seed \
 *     npx ts-node --transpile-only src/scripts/checkWorldSeed.ts
 */

const FORBIDDEN = new Set(['fspro', 'postgres', 'template0', 'template1']);

function printHistogram(label: string, rows: { bucket: string; count: number }[]) {
  console.log(`\n${label}`);
  const max = Math.max(1, ...rows.map((r) => r.count));
  for (const r of rows) {
    const bar = '█'.repeat(Math.round((r.count / max) * 24));
    console.log(`  ${r.bucket.padEnd(7)} ${bar.padEnd(25)} ${r.count}`);
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (FORBIDDEN.has(dbName)) throw new Error(`Refusing to run on "${dbName}" - use a scratch database`);

  const db = DrizzleDatabase.getInstance().database;
  const [country] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(places)
    .where(eq(places.Type, 'country'));
  assert.ok(Number(country?.n ?? 0) >= 8, `need the starter countries in Places (found ${country?.n ?? 0})`);

  const beforePlayers = await freeAgentPlayerCount();
  const beforeManagers = await freeAgentManagerCount();
  console.log(`before: ${beforePlayers} free-agent players, ${beforeManagers} free managers`);

  const first = await seedFreeAgentMarket();
  console.log(
    `run 1: +${first.playersAdded} players, +${first.managersAdded} managers -> ` +
      `${first.playerTotal} / ${first.managerTotal}`
  );
  const second = await seedFreeAgentMarket();
  console.log(
    `run 2: +${second.playersAdded} players, +${second.managersAdded} managers -> ` +
      `${second.playerTotal} / ${second.managerTotal}`
  );

  const players = await freeAgentPlayerCount();
  const managers = await freeAgentManagerCount();
  assert.strictEqual(second.playersAdded, 0, 'a second seed run added players (not idempotent)');
  assert.strictEqual(second.managersAdded, 0, 'a second seed run added managers (not idempotent)');
  assert.strictEqual(players, TARGET_FREE_AGENTS, `expected ${TARGET_FREE_AGENTS} free agents, got ${players}`);
  assert.strictEqual(managers, TARGET_FREE_MANAGERS, `expected ${TARGET_FREE_MANAGERS} managers, got ${managers}`);

  printHistogram('Free-agent player Rating histogram', await freeAgentHistogram());
  printHistogram('Free-agent manager Overall histogram', await managerHistogram());

  console.log(`\nok  exactly ${players} free-agent players / ${managers} managers`);
  console.log('ok  second run added nothing (idempotent)');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
