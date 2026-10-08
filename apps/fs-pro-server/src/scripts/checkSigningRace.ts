import 'dotenv/config';
import assert from 'assert';
import { randomUUID } from 'crypto';
import { and, eq, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../db/drizzle';
import { calendars, clubs, ownerProgram, places, players, transferLedger } from '../db/drizzle/schema';
import { signPlayer } from '../services/program/free-agent-market.service';

/**
 * Phase-2 B2-2C signing-race check (L5). Two owners race to sign the same free
 * agent; the conditional writes in `signPlayer` must let exactly one win, debit
 * the budget once, and write exactly one ledger row. A retry by the winner must
 * not double-charge.
 *
 *   DATABASE_URL=postgres://fspro:...@localhost:5434/fspro_p2c_race \
 *     npx ts-node --transpile-only src/scripts/checkSigningRace.ts
 */

const FORBIDDEN = new Set(['fspro', 'postgres', 'template0', 'template1']);
const db = () => DrizzleDatabase.getInstance().database;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (FORBIDDEN.has(dbName)) throw new Error(`Refusing to run on "${dbName}" - use a scratch database`);

  const now = new Date();
  const [calendar] = await db().select({ id: calendars.id }).from(calendars).limit(1);
  if (!calendar) {
    await db().insert(calendars).values({ CurrentDate: now, CurrentDay: 0, YearStartDay: 0, updatedAt: now });
  }

  const tag = randomUUID().slice(0, 8);
  const [country] = await db()
    .insert(places)
    .values({ Fullname: `Race Republic ${tag}`, Name: `Race ${tag}`, Code: `RC${tag.toUpperCase()}`, Region: 'world', Type: 'country', CultureId: 'kev', updatedAt: now })
    .returning();
  const price = 50_000;
  const budgetA = 100_000;
  const budgetB = 100_000;
  const clubIds: string[] = [];
  for (const [i, budget] of [budgetA, budgetB].entries()) {
    const [club] = await db()
      .insert(clubs)
      .values({ Name: `Race Club ${i} ${tag}`, ClubCode: `RA${i}${tag.slice(0, 2).toUpperCase()}`, Budget: budget, AddressCountryId: country!.id, updatedAt: now })
      .returning({ id: clubs.id });
    clubIds.push(club!.id);
    await db().insert(ownerProgram).values({ ClubId: club!.id, Step: 'players', StartingBalance: budget, updatedAt: now });
  }

  const [player] = await db()
    .insert(players)
    .values({ FirstName: 'Race', LastName: 'Target', Age: 24, Position: 'ST', Role: 'ST', Rating: 55, Value: price, Wage: 7_500, Attributes: {}, isSigned: false, isRetired: false, FreeAgentSince: 0, updatedAt: now })
    .returning({ id: players.id });

  const results = await Promise.allSettled([
    signPlayer(clubIds[0]!, player!.id),
    signPlayer(clubIds[1]!, player!.id),
  ]);
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.strictEqual(fulfilled.length, 1, `expected exactly one winner, got ${fulfilled.length}`);
  assert.strictEqual(rejected.length, 1, `expected exactly one loser, got ${rejected.length}`);
  console.log(`ok  one winner, one loser: ${(rejected[0] as PromiseRejectedResult).reason?.message ?? ''}`);

  const [after] = await db().select().from(players).where(eq(players.id, player!.id));
  assert.ok(after!.isSigned && after!.ClubId, 'the player was not signed');
  const winnerId = after!.ClubId!;
  console.log(`ok  the signed player belongs to exactly one club`);

  const ledger = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(transferLedger)
    .where(and(eq(transferLedger.PlayerId, player!.id), eq(transferLedger.Type, 'transfer')));
  assert.strictEqual(Number(ledger[0]!.n), 1, 'expected exactly one transfer ledger row');
  for (const id of clubIds) {
    const [c] = await db().select({ budget: clubs.Budget }).from(clubs).where(eq(clubs.id, id));
    const spent = (id === winnerId ? budgetA : budgetB) - (c!.budget ?? 0);
    if (id === winnerId) assert.strictEqual(spent, price, 'winner was not debited exactly once');
    else assert.strictEqual(spent, 0, 'loser was debited');
  }
  console.log(`ok  exactly one debit of V${price.toLocaleString('en-US')}, loser charged nothing`);

  // Retry by the winner must not double-sign or double-charge.
  await assert.rejects(() => signPlayer(winnerId, player!.id), /not a free agent|signed/i);
  const ledger2 = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(transferLedger)
    .where(and(eq(transferLedger.PlayerId, player!.id), eq(transferLedger.Type, 'transfer')));
  assert.strictEqual(Number(ledger2[0]!.n), 1, 'a retry double-charged');
  console.log('ok  a retry by the winner did not double-charge');

  console.log('\n5 checks passed');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
