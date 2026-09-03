/**
 * One-time backfill: gives every Player without a Wage one, derived from
 * their existing Value (see `utils/players.ts`'s `calculatePlayerWage` -
 * the exact same formula newly-created players get automatically now).
 * Safe to re-run - only touches rows where `Wage IS NULL`.
 */
import 'dotenv/config';
import { eq, isNull } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { players } from '../../db/drizzle/schema';
import { calculatePlayerWage } from '../../utils/players';

async function main() {
  const dz = DrizzleDatabase.getInstance();
  await dz.start();
  const db = dz.database;

  const unseededPlayers = await db
    .select({ id: players.id, Value: players.Value })
    .from(players)
    .where(isNull(players.Wage));

  console.log(`Found ${unseededPlayers.length} player(s) with no Wage.`);

  for (const player of unseededPlayers) {
    const wage = calculatePlayerWage(player.Value ?? 0);
    await db
      .update(players)
      .set({ Wage: wage, updatedAt: new Date() })
      .where(eq(players.id, player.id));
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
