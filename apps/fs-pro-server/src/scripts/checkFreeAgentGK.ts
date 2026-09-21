import 'dotenv/config';
import { DrizzleDatabase } from '../db/drizzle';
import { players, transferLedger } from '../db/drizzle/schema';
import { eq, and, sql } from 'drizzle-orm';

async function main() {
  const db = DrizzleDatabase.getInstance().database;

  const allFreeAgents = await db
    .select({
      pos: players.Position,
      count: sql<number>`count(*)`,
    })
    .from(players)
    .where(and(eq(players.isSigned, false), eq(players.isRetired, false)))
    .groupBy(players.Position);

  console.log('Free agents by position:', allFreeAgents);

  // Check how many clubs and their GK counts
  const clubRosters = await db
    .select({
      clubId: players.ClubId,
      clubCode: players.ClubCode,
      gkCount: sql<number>`count(*)`,
    })
    .from(players)
    .where(and(eq(players.Position, 'GK'), eq(players.isSigned, true), eq(players.isRetired, false)))
    .groupBy(players.ClubId, players.ClubCode);

  console.log('Clubs with GKs count:', clubRosters.length);
  console.log('GK count breakdown:', {
    with1GK: clubRosters.filter(r => Number(r.gkCount) === 1).length,
    with2GK: clubRosters.filter(r => Number(r.gkCount) === 2).length,
    with3PlusGK: clubRosters.filter(r => Number(r.gkCount) >= 3).length,
  });

  // Check transfer ledger for GK signings
  const gkLedger = await db
    .select()
    .from(transferLedger)
    .where(sql`"Note" ILIKE '%GK%'`)
    .limit(10);
  console.log('GK Ledger entries (first 10):', gkLedger.map(l => ({ type: l.Type, note: l.Note, date: l.createdAt })));

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
