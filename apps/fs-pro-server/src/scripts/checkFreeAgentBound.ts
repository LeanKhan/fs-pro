import 'dotenv/config';
import assert from 'assert';
import { eq } from 'drizzle-orm';
import { DrizzleDatabase } from '../db/drizzle';
import { calendars, places } from '../db/drizzle/schema';
import {
  FREE_AGENT_TTL_DAYS,
  MAX_FREE_AGENTS,
  TARGET_FREE_AGENTS,
  expireFreeAgents,
  freeAgentPlayerCount,
  restockAfterFounding,
  seedFreeAgentMarket,
} from '../services/world/world-seed.service';

/**
 * Phase-2 B2-2C bounded-market check (L5). Restock runs once per founding; a
 * burst of `RESTOCK_RUNS` foundings must not grow the free-agent pool without
 * bound (the global cap holds), and year-end expiry returns it toward the seed
 * band. Applies the real `restockAfterFounding` entry point per synthetic club,
 * so the idempotency ledger and the cap are the code the game runs.
 *
 *   DATABASE_URL=postgres://fspro:...@localhost:5434/fspro_p2c_bound \
 *     RESTOCK_RUNS=10000 npx ts-node --transpile-only src/scripts/checkFreeAgentBound.ts
 */

const FORBIDDEN = new Set(['fspro', 'postgres', 'template0', 'template1']);
const db = () => DrizzleDatabase.getInstance().database;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (FORBIDDEN.has(dbName)) throw new Error(`Refusing to run on "${dbName}" - use a scratch database`);

  const runs = Number(process.env.RESTOCK_RUNS) || 10_000;

  if ((await freeAgentPlayerCount()) < TARGET_FREE_AGENTS) {
    await seedFreeAgentMarket();
  }
  const [country] = await db().select({ id: places.id }).from(places).where(eq(places.Type, 'country')).limit(1);
  assert.ok(country, 'no country row');

  const before = await freeAgentPlayerCount();
  let added = 0;
  let skipped = 0;
  const start = Date.now();
  for (let i = 0; i < runs; i++) {
    const r = await restockAfterFounding(`p2c-bound-${i}`, country!.id);
    added += r.players;
    if (r.skipped) skipped++;
  }
  const after = await freeAgentPlayerCount();
  console.log(
    `${runs} restocks in ${((Date.now() - start) / 1000).toFixed(1)}s: +${added} players, ` +
      `${skipped} no-ops; pool ${before} -> ${after}`
  );
  assert.ok(after <= MAX_FREE_AGENTS, `pool grew past the cap: ${after} > ${MAX_FREE_AGENTS}`);
  console.log(`ok  pool stayed bounded (${after} <= MAX_FREE_AGENTS ${MAX_FREE_AGENTS})`);

  // Idempotency: a repeated restock for the same club adds nothing.
  const repeat = await restockAfterFounding('p2c-bound-0', country!.id);
  assert.strictEqual(repeat.players, 0, 'a repeated restock added players');
  console.log('ok  a repeated restock for the same club is a no-op');

  const [cal] = await db().select({ day: calendars.CurrentDay }).from(calendars).limit(1);
  const day = cal?.day ?? 0;
  const expired = await expireFreeAgents(day + FREE_AGENT_TTL_DAYS + 1);
  const afterExpiry = await freeAgentPlayerCount();
  console.log(`expiry at day ${day + FREE_AGENT_TTL_DAYS + 1} retired ${expired.players}; pool now ${afterExpiry}`);
  assert.ok(afterExpiry < after, 'expiry did not shrink the pool');

  console.log('\n3 checks passed');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
