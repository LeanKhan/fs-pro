/**
 * One-time backfill: gives every Club without a Budget a starting one, so
 * the transfer market (transfers/transfer.service.ts) has real money to
 * work with. Safe to re-run - only touches rows where `Budget IS NULL`.
 *
 * Formula: `max(FLOOR_BUDGET, BUDGET_MULTIPLIER * sum(squad Value))` - a
 * placeholder game-balance number, not a considered balance pass. Tune the
 * two constants below if the numbers feel off in practice; nothing else
 * depends on this specific formula.
 */
import 'dotenv/config';
import { eq, isNull, and, sql as drizzleSql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, players } from '../../db/drizzle/schema';

const FLOOR_BUDGET = 500_000;
const BUDGET_MULTIPLIER = 0.5;

async function main() {
  const dz = DrizzleDatabase.getInstance();
  await dz.start();
  const db = dz.database;

  const unseededClubs = await db
    .select({ id: clubs.id, Name: clubs.Name })
    .from(clubs)
    .where(isNull(clubs.Budget));

  console.log(`Found ${unseededClubs.length} club(s) with no Budget.`);

  for (const club of unseededClubs) {
    const [squadValue] = await db
      .select({ total: drizzleSql<number>`coalesce(sum(${players.Value}), 0)` })
      .from(players)
      .where(and(eq(players.ClubId, club.id), eq(players.isSigned, true)));

    const squadTotal = Number(squadValue?.total ?? 0);
    const budget = Math.max(
      FLOOR_BUDGET,
      Math.round(BUDGET_MULTIPLIER * squadTotal)
    );

    await db
      .update(clubs)
      .set({ Budget: budget, updatedAt: new Date() })
      .where(eq(clubs.id, club.id));

    console.log(
      `${club.Name}: squad value ${squadTotal} -> Budget ${budget}`
    );
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
