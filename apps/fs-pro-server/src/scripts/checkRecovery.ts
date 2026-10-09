import 'dotenv/config';
import assert from 'assert';
import { randomUUID } from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../db/drizzle';
import { calendars, clubs, managers, ownerProgram, places, players, transferLedger } from '../db/drizzle/schema';
import { LOAN_FEE, LOAN_GROSS, requestLoan } from '../services/program/owner-program.service';
import { deductWagesForYear, settleTransfer } from '../controllers/transfers/transfer.service';

/**
 * Phase-2 B2-2C economy/recovery check (L5/L7). A broke Level-0 club must have
 * a recovery path (board advance, once per year) and must pay its wages - players
 * AND its employed manager - before it has any league income. Also proves the
 * sell-a-player recovery path moves money between clubs.
 *
 *   DATABASE_URL=postgres://fspro:...@localhost:5434/fspro_p2c_recovery \
 *     npx ts-node --transpile-only src/scripts/checkRecovery.ts
 */

const FORBIDDEN = new Set(['fspro', 'postgres', 'template0', 'template1']);
const db = () => DrizzleDatabase.getInstance().database;

async function budgetOf(clubId: string): Promise<number> {
  const [c] = await db().select({ budget: clubs.Budget }).from(clubs).where(eq(clubs.id, clubId));
  return c!.budget ?? 0;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (FORBIDDEN.has(dbName)) throw new Error(`Refusing to run on "${dbName}" - use a scratch database`);

  const now = new Date();
  await db().delete(calendars);
  await db().insert(calendars).values({ CurrentDate: now, CurrentDay: 10, CurrentYear: 1, YearStartDay: 0, YearLengthDays: 28, updatedAt: now });

  const tag = randomUUID().slice(0, 8);
  const [country] = await db()
    .insert(places)
    .values({ Fullname: `Recovery ${tag}`, Name: `Recovery ${tag}`, Code: `RV${tag.toUpperCase()}`, Region: 'world', Type: 'country', CultureId: 'kev', updatedAt: now })
    .returning();

  const [club] = await db()
    .insert(clubs)
    .values({ Name: `Broke FC ${tag}`, ClubCode: `BR${tag.slice(0, 2).toUpperCase()}`, Budget: 0, AddressCountryId: country!.id, updatedAt: now })
    .returning({ id: clubs.id });
  const [buyer] = await db()
    .insert(clubs)
    .values({ Name: `Rich FC ${tag}`, ClubCode: `RI${tag.slice(0, 2).toUpperCase()}`, Budget: 5_000_000, AddressCountryId: country!.id, updatedAt: now })
    .returning({ id: clubs.id });
  await db().insert(ownerProgram).values({ ClubId: club!.id, Step: 'players', StartingBalance: 1_000_000, updatedAt: now });

  const [signed] = await db()
    .insert(players)
    .values({ FirstName: 'Wage', LastName: 'Player', Age: 26, Position: 'ST', Role: 'ST', Rating: 60, Value: 100_000, Wage: 20_000, Attributes: {}, isSigned: true, isRetired: false, ClubId: club!.id, ClubCode: `BR${tag.slice(0, 2).toUpperCase()}`, updatedAt: now })
    .returning({ id: players.id });
  await db()
    .insert(managers)
    .values({ Key: `recovery-mgr-${tag}`, FirstName: 'Wage', LastName: 'Manager', Age: 50, ClubId: club!.id, isEmployed: true, Tactics: 55, Motivation: 55, Development: 55, Discipline: 55, Overall: 55, Wage: 10_000, SigningFee: 180_000, ContractYears: 2, updatedAt: now });

  // 1. Board advance recovers a broke club.
  const loan = await requestLoan(club!.id);
  assert.strictEqual(loan.amount, LOAN_GROSS - LOAN_FEE);
  assert.strictEqual(await budgetOf(club!.id), LOAN_GROSS - LOAN_FEE);
  console.log(`ok  board advance granted: ${LOAN_GROSS - LOAN_FEE} (V${LOAN_GROSS} less V${LOAN_FEE} fee)`);

  // 2. Only once per game year (no infinite money tap).
  await assert.rejects(() => requestLoan(club!.id), /already advanced/i);
  console.log('ok  a second board advance in the same year is refused');

  // 3. Wages (player + employed manager) are charged at year end.
  const beforeWages = await budgetOf(club!.id);
  await deductWagesForYear('Y1');
  const afterWages = await budgetOf(club!.id);
  assert.strictEqual(beforeWages - afterWages, 30_000, 'wages were not the player + manager bill');
  const [wageLedger] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(transferLedger)
    .where(eq(transferLedger.Type, 'wage'));
  console.log(`ok  year-end wages charged 30,000 (player 20k + manager 10k); ${wageLedger!.n} wage ledger row(s)`);

  // 4. Selling a player is the other recovery path.
  const beforeSale = await budgetOf(club!.id);
  const beforeBuyer = await budgetOf(buyer!.id);
  await settleTransfer({ playerId: signed!.id, buyingClubId: buyer!.id, amount: 100_000, note: 'recovery sale' });
  assert.strictEqual(await budgetOf(club!.id), beforeSale + 100_000, 'seller was not credited');
  assert.strictEqual(await budgetOf(buyer!.id), beforeBuyer - 100_000, 'buyer was not debited');
  const [moved] = await db().select({ club: players.ClubId }).from(players).where(eq(players.id, signed!.id));
  assert.strictEqual(moved!.club, buyer!.id, 'the player did not move');
  console.log('ok  selling a player credited the seller and moved the player');

  console.log('\n4 checks passed');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
