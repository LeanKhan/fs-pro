import 'dotenv/config';
import assert from 'assert';
import http from 'http';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { DEFAULT_PYRAMID_STAGE } from '../services/competitions/pyramid.service';
import { DrizzleDatabase } from '../db/drizzle';
import { calendars, clubs, entries, ownerProgram, places, pools, seasons } from '../db/drizzle/schema';
import { enterPyramidAtLevelOne } from '../services/world/level-change';
import { ensureNationalLeague } from '../services/competitions/world-competitions.service';

/**
 * Phase 2 B2-2B concurrency check (L2): 50 clubs at Level 1 race the pyramid
 * trigger; each must end with exactly ONE Entries row. The Go world-service is
 * replaced by a tiny local stub that always assigns a fresh slot in the single
 * pre-created pool, so the real `joinPyramid` idempotency (advisory lock +
 * already-entered guard) and the `(SeasonId, ClubId)` uniqueness are what is
 * under test.
 *
 *   DATABASE_URL=postgres://fspro:...@localhost:5434/fspro_b2b2b_conc \
 *     npx ts-node --transpile-only src/scripts/checkProgramConcurrency.ts
 */

let passed = 0;
function ok(name: string) {
  passed++;
  console.log(`  ok  ${name}`);
}

const FORBIDDEN = new Set(['fspro', 'postgres', 'template1']);
const N = Number(process.env.PROGRAM_CONCURRENCY_CLUBS) || 50;

const db = () => DrizzleDatabase.getInstance().database;

async function count(sqlText: ReturnType<typeof sql>) {
  const [row] = await db().select({ n: sql<number>`count(*)::int` }).from(entries).where(sqlText);
  return row!.n;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (FORBIDDEN.has(dbName)) throw new Error(`Refusing to run on "${dbName}" - use a scratch database`);

  const [{ n: existing }] = await db().select({ n: sql<number>`count(*)::int` }).from(clubs);
  if (existing) throw new Error('Refusing to run: the Clubs table is not empty (use a scratch database)');

  // --- Fixtures: a calendar, a country, 50 Level-1 clubs, a running pyramid. --
  const now = new Date();
  await db().insert(calendars).values({
    CurrentDate: now,
    CurrentDay: 0,
    YearStartDay: 0,
    YearLengthDays: 28,
    updatedAt: now,
  });
  const [country] = await db()
    .insert(places)
    .values({
      Fullname: 'Republic of Concurrency',
      Name: 'Concurrency',
      Code: 'CON',
      Region: 'world',
      Type: 'country',
      CultureId: 'kev',
      updatedAt: now,
    })
    .returning();

  const clubIds: string[] = [];
  for (let i = 0; i < N; i++) {
    const code = `C${String(i).padStart(2, '0')}`;
    const [club] = await db()
      .insert(clubs)
      .values({
        Name: `Concurrent Club ${i}`,
        ClubCode: code,
        AddressCountryId: country!.id,
        XP: 100,
        Budget: 1_000_000,
        updatedAt: now,
      })
      .returning({ id: clubs.id });
    clubIds.push(club!.id);
    await db().insert(ownerProgram).values({ ClubId: club!.id, Step: 'manager', StartingBalance: 1_000_000, updatedAt: now });
  }
  ok(`${N} Level-1 clubs created, each with a manager-step program`);

  const league = await ensureNationalLeague(country!.id);
  assert.ok(league, 'the national league competition was created');
  const [season] = await db()
    .insert(seasons)
    .values({
      SeasonCode: `${league!.id.slice(0, 6)}-E1`,
      Title: 'Concurrency League · Year 1',
      StartDate: now,
      EndDate: now,
      Status: 'running',
      CompetitionId: league!.id,
      CompetitionCode: 'PYR-CON',
      EditionNumber: 1,
      StartDay: 0,
      EndDay: 27,
      CurrentStage: 0,
      Definition: {
        Name: 'Concurrency League',
        Prestige: 3,
        Entry: { mode: 'invite', minClubs: 2, maxClubs: null, countryIds: [country!.id] },
        Stages: [DEFAULT_PYRAMID_STAGE],
        Rewards: { prizeMoney: [], xp: [] },
        Recurrence: null,
      } as never,
      updatedAt: now,
    })
    .returning();
  const [pool] = await db()
    .insert(pools)
    .values({ SeasonId: season!.id, Division: 4, Number: 0, Name: 'Concurrency D4', KickoffHour: 19, Size: 10 })
    .returning();
  ok('a running pyramid edition with one bottom-division pool exists');

  // --- Go stub: POST /pyramid/join assigns a fresh slot in that pool. --------
  let slotSeq = 0;
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/pyramid/join') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ division: 4, poolId: pool!.id, slot: slotSeq++, newPool: false }));
      });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const previousUrl = process.env.WORLD_SERVICE_URL;
  process.env.WORLD_SERVICE_URL = `http://127.0.0.1:${port}`;
  ok(`world-service stub listening on 127.0.0.1:${port}`);

  try {
    // --- Round 1: 50 concurrent level-ups. -----------------------------------
    // Which call reports "placed" is racy (a later call may see an existing
    // entry); the invariant under test is the entry count, not the return.
    await Promise.all(clubIds.map((id) => enterPyramidAtLevelOne(id)));

    const grouped = await db()
      .select({ clubId: entries.ClubId, n: sql<number>`count(*)::int` })
      .from(entries)
      .where(isNotNull(entries.Division))
      .groupBy(entries.ClubId);
    assert.strictEqual(grouped.length, N, 'a club has no entry');
    assert.ok(
      grouped.every((g) => g.n === 1),
      `a club has more than one entry: ${grouped.filter((g) => g.n !== 1).map((g) => `${g.clubId}=${g.n}`).join(', ')}`
    );
    assert.strictEqual(await count(sql`1 = 1`), N, 'the Entries table has more rows than clubs');
    ok(`${N} concurrent triggers produced exactly ${N} entries, one per club`);

    // --- Round 2: the same 50 race again; still exactly one each. ------------
    await Promise.all(clubIds.map((id) => enterPyramidAtLevelOne(id)));
    assert.strictEqual(await count(sql`1 = 1`), N, 'a repeated trigger inserted a second entry');
    const done = await db()
      .select({ n: sql<number>`count(*)::int` })
      .from(ownerProgram)
      .where(and(eq(ownerProgram.Step, 'done')));
    assert.strictEqual(done[0]!.n, N, 'a racer did not mark its program done');
    ok(`a second race left the entry count at ${N} and every program at 'done'`);

    console.log(`\n${passed} checks passed`);
    process.exit(0);
  } finally {
    if (previousUrl === undefined) delete process.env.WORLD_SERVICE_URL;
    else process.env.WORLD_SERVICE_URL = previousUrl;
    server.close();
    await DrizzleDatabase.getInstance().disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
