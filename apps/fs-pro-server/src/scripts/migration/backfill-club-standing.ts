import 'dotenv/config';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs } from '../../db/drizzle/schema';
import { ensureStanding } from '../../services/world/club-standing.service';

/**
 * One-off after migration 0026: gives every club a starting Fans/Reputation
 * (from its stadium and Rating) so the world doesn't start at zero. Uses the
 * same ensureStanding the game calls lazily, so it's idempotent - clubs that
 * already have standing are left alone.
 */
async function main() {
  const db = DrizzleDatabase.getInstance().database;
  const all = await db.select({ id: clubs.id }).from(clubs);
  for (const c of all) {
    const s = await ensureStanding(c.id);
    console.log(`${s.Name}: fans ${s.Fans}, reputation ${s.Reputation}`);
  }
  console.log(`✅ Standing backfilled for ${all.length} clubs`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Backfill failed:', err);
  process.exit(1);
});
