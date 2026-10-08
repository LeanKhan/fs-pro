import 'dotenv/config';
import assert from 'assert';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { dayKind, leagueDays, randomCrest, type FoundClub } from '@repo/api-contract';
import { DrizzleDatabase } from '../db/drizzle';
import { calendars, clubs, entries, fixtures, newsItems, places, seasons, users } from '../db/drizzle/schema';
import { roundCount, roundRobin } from '../utils/round-robin';
import { pyramidShape, poolTables } from '../services/competitions/pyramid.service';
import { foundClub } from '../services/world/club-founding.service';
import { createInvite, previewPlacement } from '../services/world/placement.service';
import { bar, postNews, scopeChain } from '../services/world/news-scope.service';
import { releaseInactiveClubs, sweepCaretakers } from '../services/world/caretaker.service';
import { runWorldDay } from '../services/world/world-day.service';
import { enterPyramidAtLevelOne } from '../services/world/level-change';

/**
 * End-to-end checks for the world pyramid (docs/perfect/WORLD-HIERARCHY-SPEC.md
 * §3-§4; docs/WORLD-PYRAMID-SPEC.md): placement and fill order in the
 * country > region > city > district tree, invites, the district cap under
 * concurrent foundings, the pyramid draw (delegated to the Go world-service),
 * joining mid-season, a full simulated season, the year-end finish with
 * promotion and relegation, the next draw, local news scopes, caretakers and
 * release.
 *
 * Needs an EMPTY scratch database with the current schema and the Go
 * world-service running against it (WORLD_SERVICE_URL, default
 * http://localhost:3006); it refuses to run if Clubs has any rows, so it can
 * never touch real game data.
 *
 *   REALTIME_URL=off DATABASE_URL=postgres://.../scratch \
 *     npx ts-node --transpile-only src/scripts/checkWorldPyramid.ts
 *
 * WORLD_CHECK_CLUBS sets how many clubs to found (default 40).
 */

let passed = 0;
function ok(name: string) {
  passed++;
  console.log(`  ok  ${name}`);
}

function pureChecks() {
  console.log('pure');

  // Shapes: full divisions top-down, the rest spread over the bottom one.
  const shape = (n: number) => pyramidShape(n, 10, 0.8);
  assert.deepStrictEqual(shape(1)[0]!.poolClubs, [1]);
  assert.deepStrictEqual(shape(11).map((d) => d.poolClubs), [[11]]);
  assert.deepStrictEqual(shape(12).map((d) => d.poolClubs), [[10], [2]]);
  assert.deepStrictEqual(shape(31).map((d) => d.poolClubs), [[10], [7, 7, 7]]);
  const big = shape(288);
  assert.deepStrictEqual(big.map((d) => d.division), [1, 2, 3, 4, 5]);
  assert.strictEqual(big.reduce((n, d) => n + d.clubs, 0), 288);
  for (const d of big.slice(0, -1)) assert.strictEqual(d.poolSizes.length, 2 ** (d.division - 1));
  const bottom = big[big.length - 1]!;
  assert.ok(bottom.poolClubs.every((c) => c <= 8), 'bottom pools keep spare slots');
  assert.ok(Math.max(...bottom.poolClubs) - Math.min(...bottom.poolClubs) <= 1, 'bottom pools are even');
  const huge = shape(10_000);
  assert.strictEqual(huge.reduce((n, d) => n + d.clubs, 0), 10_000);
  ok('pyramid shapes for 1, 11, 12, 31, 288 and 10,000 clubs');

  // Round-robins: everyone meets everyone `legs` times, once per round.
  for (const [size, legs] of [[10, 2], [7, 1], [2, 2], [11, 2]] as const) {
    const rounds = roundRobin(size, legs);
    assert.strictEqual(rounds.length, roundCount(size, legs));
    const meets = new Map<string, number>();
    for (const round of rounds) {
      const seen = new Set<number>();
      for (const p of round) {
        assert.ok(!seen.has(p.home) && !seen.has(p.away), 'a slot plays once per round');
        seen.add(p.home);
        seen.add(p.away);
        const key = [p.home, p.away].sort((a, b) => a - b).join('-');
        meets.set(key, (meets.get(key) ?? 0) + 1);
      }
    }
    assert.strictEqual(meets.size, (size * (size - 1)) / 2);
    assert.ok([...meets.values()].every((n) => n === legs));
    if (legs === 2) {
      const homes = new Map<number, number>();
      for (const p of rounds.flat()) homes.set(p.home, (homes.get(p.home) ?? 0) + 1);
      assert.ok([...homes.values()].every((n) => n === size - 1), 'home and away even over two legs');
    }
  }
  ok('round-robins: every pair meets once per leg, one game per slot per round');

  const year = { WeekTemplate: ['L', 'C', 'L', 'L', 'C', 'L', 'L'] as ('L' | 'C')[], YearStartDay: 5, YearLengthDays: 28 };
  assert.strictEqual(leagueDays(year).length, 20);
  assert.strictEqual(dayKind(year, 5), 'L');
  assert.strictEqual(dayKind(year, 6), 'C');
  assert.strictEqual(dayKind(year, 12), 'L');
  ok('week template: 20 league days and 8 cup days in a 28-day year');

  // News scopes: the leaf is the district now (migration 0038).
  const a = { district: 'd1', region: 'r1', country: 'c1' };
  assert.deepStrictEqual(scopeChain([a, a]).map((s) => s.scope), ['district', 'region', 'country', 'world']);
  assert.deepStrictEqual(scopeChain([a, { ...a, district: 'd2' }]).map((s) => s.scope), ['region', 'country', 'world']);
  assert.deepStrictEqual(scopeChain([a, { district: 'd3', region: 'r3', country: 'c3' }]).map((s) => s.scope), ['world']);
  assert.ok(bar('country', 2000) > bar('country', 288) && bar('country', 288) === bar('country', 10));
  ok('news: natural scope and a bar that rises only with a busy scope');
}

const db = () => DrizzleDatabase.getInstance().database;
/** The first year of the check world (day 0, default week template). */
const YEAR0 = { WeekTemplate: ['L', 'C', 'L', 'L', 'C', 'L', 'L'] as ('L' | 'C')[], YearStartDay: 0, YearLengthDays: 28 };

async function count(table: typeof clubs | typeof places, where?: ReturnType<typeof sql>) {
  const [row] = await db().select({ n: sql<number>`count(*)::int` }).from(table).where(where);
  return row!.n;
}

let userSeq = 0;
async function newUser() {
  const n = ++userSeq;
  const [u] = await db()
    .insert(users)
    .values({ FullName: `Manager ${n}`, Password: 'x', Username: `check-${n}-${Date.now()}`, updatedAt: new Date() })
    .returning({ id: users.id });
  return u!.id;
}

/** Every club founded by the check, in order (phase 2: they join the pyramid
 * only when promoted to Level 1, not at founding). */
const allClubs: { clubId: string; countryId: string }[] = [];

/** Found a club, naming any new places it opens. */
let clubSeq = 0;
async function found(invite?: string) {
  const n = ++clubSeq;
  const letters = (k: number) => String.fromCharCode(65 + (k % 26)) + String.fromCharCode(65 + Math.floor(k / 26) % 26);
  const body: FoundClub = {
    invite,
    name: `Check Club ${n}`,
    code: `Q${letters(n)}`,
    crest: randomCrest(`c${n}`, `Q${letters(n)}`),
    newTown: { name: `City ${n}`, terrain: 'city' },
    newRegion: { name: `Region ${n}` },
    newCountry: { name: `Land ${n}`, code: `L${letters(n)}`, colors: ['#2f8a1c', '#f5b82e'] },
  };
  const club = await foundClub(await newUser(), body);
  allClubs.push({ clubId: club.clubId, countryId: club.country.id });
  return club;
}

async function placeInvariants(sizes: { district: number; city: number; region: number; country: number }) {
  const overfull = await db().execute(sql`
    SELECT "DistrictId" FROM "Clubs" WHERE "DistrictId" IS NOT NULL GROUP BY "DistrictId" HAVING count(*) > ${sizes.district}`);
  assert.strictEqual(overfull.length, 0, 'no district over DistrictClubs');
  const cities = await db().execute(sql`
    SELECT "ParentId" FROM "Places" WHERE "Type" = 'district' AND "ParentId" IS NOT NULL
    GROUP BY "ParentId" HAVING count(*) > ${sizes.city + 1}`);
  assert.strictEqual(cities.length, 0, 'no city over CityDistricts (+1 for invites)');
  const regions = await db().execute(sql`
    SELECT "RegionId" FROM "Places" WHERE "Type" = 'city' AND "RegionId" IS NOT NULL
    GROUP BY "RegionId" HAVING count(*) > ${sizes.region + 1}`);
  assert.strictEqual(regions.length, 0, 'no region over RegionCities (+1 for invites)');
  const countries = await db().execute(sql`
    SELECT "ParentId" FROM "Places" WHERE "Type" = 'region' GROUP BY "ParentId" HAVING count(*) > ${sizes.country}`);
  assert.strictEqual(countries.length, 0, 'no country over CountryRegions');
}

async function dbChecks() {
  console.log('database');
  if (await count(clubs)) throw new Error('Refusing to run: the Clubs table is not empty (use a scratch database)');
  const N = Number(process.env.WORLD_CHECK_CLUBS) || 40;
  // Small capacities so the world opens many levels in ~40 clubs. The capital
  // city is capped like an ordinary one (MetropolisDistricts = CityDistricts)
  // so the test exercises city/region/country growth rather than one big
  // metropolis.
  const sizes = { district: 3, city: 2, region: 2, country: 2 };

  const now = new Date();
  await db().delete(calendars);
  await db().insert(calendars).values({
    CurrentDate: now,
    CurrentDay: 0,
    YearStartDay: 0,
    YearLengthDays: 28,
    DistrictClubs: sizes.district,
    CityDistricts: sizes.city,
    RegionCities: sizes.region,
    CountryRegions: sizes.country,
    MetropolisDistricts: sizes.city,
    updatedAt: now,
  });
  await DrizzleDatabase.getInstance().sql`CREATE SEQUENCE IF NOT EXISTS manager_counter_seq`;

  // --- Placement -------------------------------------------------------------
  const first = await previewPlacement();
  assert.strictEqual(first.kind, 'new-country');
  assert.deepStrictEqual(first.needs, { town: true, region: true, country: true });
  const c1 = await found();
  assert.deepStrictEqual(c1.opened, ['country', 'region', 'town']);
  // Phase 2 L1: no pyramid entry, no manager and no squad at founding.
  assert.strictEqual(c1.pool, null, 'a founded club has no pyramid pool');
  const [fresh] = await db()
    .select({ entries: sql<number>`count(*)::int` })
    .from(entries)
    .where(eq(entries.ClubId, c1.clubId));
  assert.strictEqual(fresh!.entries, 0, 'the first club is not entered in a pyramid');
  const [freshClub] = await db().select({ ManagerId: clubs.ManagerId }).from(clubs).where(eq(clubs.id, c1.clubId));
  assert.strictEqual(freshClub!.ManagerId, null, 'the first club has no manager at founding');
  const c2 = await found();
  const c3 = await found();
  assert.ok(c2.town.id === c1.town.id && c3.town.id === c1.town.id, 'a district fills first');
  const c4 = await found();
  assert.deepStrictEqual(c4.opened, ['town']);
  assert.notStrictEqual(c4.town.id, c1.town.id, 'then a new district in the same city');
  assert.strictEqual(c4.region?.id, c1.region?.id, 'the new district keeps the region');
  for (let i = 0; i < 2; i++) await found(); // c5, c6: finish the second district
  const c7 = await found(); // c7: first club of a new city in the same region
  assert.deepStrictEqual(c7.opened, ['town'], 'a full city opens a new city in the region');
  assert.strictEqual(c7.region?.id, c1.region?.id);
  for (let i = 0; i < 11; i++) await found(); // c8..c18 (c13 opens region 2)
  for (let i = 0; i < 6; i++) await found(); // c19..c24: fill region 2
  const c25 = await found(); // c25: country 1 is full -> a new country
  assert.deepStrictEqual(c25.opened, ['country', 'region', 'town'], 'a full country opens a new country');
  await placeInvariants(sizes);
  ok('fill order: district, city, region, country, then a new country');

  // Invites: a friend lands in the inviter's district.
  const [owner] = await db().select({ id: clubs.UserId }).from(clubs).where(eq(clubs.id, c25.clubId));
  const invite = await createInvite(owner!.id!, c25.clubId);
  const friend = await found(invite.token);
  assert.strictEqual(friend.town.id, c25.town.id);
  const preview = await previewPlacement(invite.token);
  assert.ok(preview.invite?.valid && preview.invite.townName === c25.town.name);
  ok("an invite link places a friend in the inviter's district");

  // Concurrent foundings never overfill a district.
  await Promise.all(Array.from({ length: 6 }, () => found()));
  await placeInvariants(sizes);
  ok('six foundings at once keep every cap');

  while (clubSeq < N) await found();
  await placeInvariants(sizes);
  const humans = await count(clubs);
  assert.strictEqual(humans, N);
  const ai = await count(clubs, sql`${clubs.UserId} IS NULL`);
  assert.strictEqual(ai, 0, 'no AI clubs are spawned');
  ok(`${N} clubs founded, no AI rivals`);

  // Phase 2 L2: a founded club is Level 0 and in no pyramid. It joins only
  // when it reaches Level 1. Promote every club and run the trigger; the first
  // Level-1 club of each country draws its edition, the rest join mid-season.
  assert.strictEqual(
    (await db().select().from(entries).where(isNotNull(entries.Division))).length,
    0,
    'a Level-0 club must not be entered in a pyramid'
  );
  await db().update(clubs).set({ XP: 100 });
  await Promise.all(allClubs.map((c) => enterPyramidAtLevelOne(c.clubId)));
  const stillUnplaced = (await db().select().from(entries).where(isNotNull(entries.Division))).length;
  assert.strictEqual(stillUnplaced, N, 'a Level-1 club did not join its pyramid');
  ok(`reaching Level 1 entered all ${N} clubs (none entered before)`);

  // --- Pyramid: the Go service assigned the pools (Node persisted them). -----
  const running = await db().select().from(seasons).where(eq(seasons.Status, 'running'));
  assert.ok(running.length >= 1, 'at least one pyramid edition is running');
  const entered = await db().select().from(entries).where(isNotNull(entries.Division));
  assert.strictEqual(entered.length, N, "every club is in its country's pyramid");
  for (const e of entered) {
    const mates = entered.filter((x) => x.Group === e.Group && x.ClubId !== e.ClubId);
    const mine = await db()
      .select()
      .from(fixtures)
      .where(and(eq(fixtures.SeasonId, e.SeasonId), sql`(${fixtures.HomeTeamId} = ${e.ClubId} OR ${fixtures.AwayTeamId} = ${e.ClubId})`));
    const opponents = new Set(mine.map((f) => (f.HomeTeamId === e.ClubId ? f.AwayTeamId : f.HomeTeamId)));
    for (const m of mates) assert.ok(opponents.has(m.ClubId), 'pool mates meet');
    assert.ok(mine.every((f) => dayKind(YEAR0, f.ScheduledDay!) === 'L'), 'league fixtures only on league days');
    const perOpponent = new Map<string, number>();
    for (const f of mine) {
      const o = f.HomeTeamId === e.ClubId ? f.AwayTeamId! : f.HomeTeamId!;
      perOpponent.set(o, (perOpponent.get(o) ?? 0) + 1);
    }
    assert.ok([...perOpponent.values()].every((k) => k <= 2), 'at most home and away');
  }
  ok(`${running.length} pyramid edition(s): pool mates are scheduled against each other, on league days only`);

  // --- A whole season, hour by hour (one runWorldDay per day). -----------------
  for (let d = 0; d < 28; d++) await runWorldDay();
  const leftover = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(fixtures)
    .where(and(eq(fixtures.Played, false), isNotNull(fixtures.SeasonId), sql`${fixtures.ScheduledDay} < 28`));
  assert.strictEqual(leftover[0]!.n, 0, 'every league fixture of the year was played');
  ok('a 28-day season plays out');

  // The 29th day starts the next year: finish, promote/relegate, redraw.
  const before = await db().select().from(entries).where(isNotNull(entries.Division));
  await runWorldDay();
  const finished = await db().select().from(seasons).where(eq(seasons.Status, 'finished'));
  assert.ok(finished.length >= running.length, "last year's pyramids finished");
  const moved = await db().select().from(entries).where(and(isNotNull(entries.Movement), sql`${entries.Movement} <> 0`));
  const redrawn = await db().select().from(seasons).where(eq(seasons.Status, 'running'));
  assert.strictEqual(redrawn.length, running.length, 'a new edition per country');
  const next = await db().select().from(entries).where(and(isNotNull(entries.Division), sql`${entries.SeasonId} IN (${sql.join(redrawn.map((s) => sql`${s.id}`), sql`, `)})`));
  for (const m of moved) {
    const was = before.find((b) => b.ClubId === m.ClubId && b.SeasonId === m.SeasonId)!;
    const now = next.find((x) => x.ClubId === m.ClubId);
    if (!now) continue;
    if (m.Movement === 1) assert.ok(now.Division! <= was.Division! - 1 || now.Division === 1, 'promoted clubs go up');
  }
  const topTables = await poolTables(redrawn[0]!.id);
  assert.ok(topTables.length >= 1);
  ok(`year end: ${finished.length} finished, ${moved.length} club(s) moved, every country redrawn`);

  // --- News: results and foundings reached their scopes. ----------------------
  const scoped = await db()
    .select({ scope: newsItems.ScopeType, n: sql<number>`count(*)::int` })
    .from(newsItems)
    .groupBy(newsItems.ScopeType);
  assert.ok(scoped.some((s) => s.scope === 'district'), 'local news exists');
  const reached = await postNews({ kind: 'test', importance: 100, title: 'Big story', clubIds: [c1.clubId] });
  assert.deepStrictEqual(reached, ['district', 'region', 'country', 'world']);
  ok(`news by scope: ${scoped.map((s) => `${s.scope} ${s.n}`).join(', ')}`);

  // --- Caretakers and release free a district slot. ---------------------------
  const [cal] = await db().select().from(calendars).limit(1);
  await db().update(clubs).set({ LastActiveAt: new Date(0) }).where(eq(clubs.id, c2.clubId));
  await sweepCaretakers(cal!);
  const [ct] = await db().select({ c: clubs.Caretaker }).from(clubs).where(eq(clubs.id, c2.clubId));
  assert.ok(ct!.c, 'an away owner gets a caretaker');
  const released = await releaseInactiveClubs(cal!);
  assert.ok(released.includes(c2.clubId));
  const [gone] = await db().select({ district: clubs.DistrictId }).from(clubs).where(eq(clubs.id, c2.clubId));
  assert.strictEqual(gone!.district, null);
  const hole = await previewPlacement();
  assert.strictEqual(hole.kind, 'town');
  assert.strictEqual(hole.town?.id, c1.town.id, 'the freed slot is the next hole');
  ok('caretaker after time away; release frees the district slot for the next club');
}

async function main() {
  pureChecks();
  await dbChecks();
  console.log(`\n${passed} checks passed`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
