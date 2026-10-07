import 'dotenv/config';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { randomCrest, type FoundClub } from '@repo/api-contract';
import { DrizzleDatabase } from '../db/drizzle';
import { calendars, clubs, fixtures, players, pools, seasons, users } from '../db/drizzle/schema';
import { foundClub } from '../services/world/club-founding.service';
import { previewPlacement } from '../services/world/placement.service';
import { getAtlas } from '../services/world/atlas.service';
import { readFeed } from '../services/world/news-scope.service';
import { poolTables } from '../services/competitions/pyramid.service';
import { runWorldDay, runWorldHour } from '../services/world/world-day.service';
import { scaleClubCode as code } from './scale-codes';

/**
 * Scale harness (docs/WORLD-PYRAMID-SPEC.md, "Testing"; docs/perfect/
 * WORLD-HIERARCHY-SPEC.md): founds N clubs through the real placement and
 * founding code (now delegated to the Go world-service), then times the paths
 * that grow with the world: founding, the atlas, placement, the news feed, a
 * pyramid table, one league kickoff hour, and the year end (finish, ageing,
 * wages, redraw). Prints a table for docs/SCALE.md.
 *
 * Needs a scratch database with the current schema and the Go world-service
 * running against it (WORLD_SERVICE_URL, default http://localhost:3006);
 * refuses a database whose Clubs table isn't empty (SCALE_APPEND=1 adds to an
 * earlier run). SCALE_SKIP_MATCHES=1 skips section 3 and the next-day kickoffs
 * in section 4 (both need the sim service); the year end still runs.
 * SCALE_CONCURRENCY=N founds N clubs at a time (default 1) and
 * SCALE_SKIP_YEAR_END=1 skips the year end, for timing a 100k founding run.
 *
 *   SCALE_CLUBS=1000 SCALE_SKIP_MATCHES=1 REALTIME_URL=off WORLD_TICK_MINUTES=0 \
 *     DATABASE_URL=postgres://.../scratch npx ts-node --transpile-only src/scripts/seedScaleWorld.ts
 */

const db = () => DrizzleDatabase.getInstance().database;
const N = Number(process.env.SCALE_CLUBS) || 1000;
/**
 * How many foundings to have in flight at once. Founding is a real mix of
 * requests from many people, and the per-founding path spends most of its
 * wall-clock waiting on Postgres and the Go world-service rather than on the
 * CPU. The placement transaction itself is serialised by PLACEMENT_LOCK, but
 * the post-commit work (squad insert, pyramid join, news, inbox) is not, so a
 * small pool overlaps those waits. Default 1 keeps the sequential profile.
 */
const CONCURRENCY = Math.max(1, Math.floor(Number(process.env.SCALE_CONCURRENCY) || 1));
const results: [string, string][] = [];

async function timed<T>(label: string, fn: () => Promise<T>, note?: (r: T) => string): Promise<T> {
  const t = Date.now();
  const r = await fn();
  const ms = Date.now() - t;
  const line = `${ms.toLocaleString('en-US')} ms${note ? ` · ${note(r)}` : ''}`;
  results.push([label, line]);
  console.log(`[scale] ${label}: ${line}`);
  return r;
}

const count = async (table: typeof clubs | typeof players | typeof fixtures) =>
  (await db().select({ n: sql<number>`count(*)::int` }).from(table))[0]!.n;

// Short 4-character codes accepted by codeProblem (^[A-Z][A-Z0-9]{1,3}$):
// a letter then three base-36 chars, i.e. 26 * 36^3 = 1,213,056 unique codes,
// so the 100,000-club target cannot collide. The generator lives in
// ./scale-codes so it is unit-tested (test/scale-codes.test.ts); the old
// letters-only scheme (`Z` + three base-26 chars) wrapped at 26^3 = 17,576,
// where code(17576) collided with code(0) and founding failed with a 409.

async function main() {
  const existing = await count(clubs);
  if (existing && process.env.SCALE_APPEND !== '1') throw new Error('Refusing to run: Clubs is not empty (use a scratch database, or SCALE_APPEND=1)');
  if (!existing) {
    const now = new Date();
    await db().delete(calendars);
    await db().insert(calendars).values({ CurrentDate: now, CurrentDay: 0, YearStartDay: 0, updatedAt: now });
    await DrizzleDatabase.getInstance().sql`CREATE SEQUENCE IF NOT EXISTS manager_counter_seq`;
  }

  // 1. Found N clubs, as N people would (optionally several at once - see
  // SCALE_CONCURRENCY).
  const start = Date.now();
  // The `town` counter is the legacy label for a new city/district (migration
  // 0038 renamed the level; the founded-club `opened` shape is unchanged).
  const opened = { town: 0, region: 0, country: 0 };
  const total = N - existing;
  let next = existing;
  let done = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= N) return;
      const [u] = await db()
        .insert(users)
        .values({ FullName: `Scale ${i}`, Password: 'x', Username: `scale-${i}-${start}`, updatedAt: new Date() })
        .returning({ id: users.id });
      const body: FoundClub = {
        name: `Scale FC ${i}`,
        code: code(i),
        crest: randomCrest(`s${i}`, code(i)),
        newTown: { name: `Scaleton ${i}`, terrain: 'city' },
        newRegion: { name: `Scale Region ${i}` },
        newCountry: { name: `Scaleland ${i}`, code: `S${code(i).slice(1)}`, colors: ['#3a8ee0', '#f2f2ee'] },
      };
      const r = await foundClub(u!.id, body);
      for (const p of r.opened) opened[p]++;
      done++;
      if (done % 250 === 0) {
        const rate = ((Date.now() - start) / done).toFixed(0);
        console.log(`[scale] ${existing + done} clubs (${rate} ms each)`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, total)) }, worker));
  results.push(['founding', `${total} clubs in ${((Date.now() - start) / 1000).toFixed(0)} s (${((Date.now() - start) / Math.max(1, total)).toFixed(0)} ms each)`]);
  results.push(['places opened', `${opened.country} countries, ${opened.region} regions, ${opened.town} cities/districts`]);
  results.push(['rows', `${await count(clubs)} clubs, ${await count(players)} players, ${await count(fixtures)} fixtures`]);

  // 2. Reads that grow with the world.
  const [any] = await db().select({ id: clubs.id, user: clubs.UserId, country: clubs.AddressCountryId }).from(clubs).limit(1);
  await timed('atlas (no club lists)', () => getAtlas(null), (a) => `${(JSON.stringify(a).length / 1024).toFixed(0)} KB, ${a.towns.length} cities`);
  await timed('atlas (one country\'s clubs)', () => getAtlas(any!.user, {}), (a) => `${(JSON.stringify(a).length / 1024).toFixed(0)} KB`);
  await timed('placement preview', () => previewPlacement(), (p) => p.kind);
  await timed('local news feed', () => readFeed(any!.id), (f) => `${f.items.length} items, local = ${f.scopes.local}`);
  const [season] = await db().select({ id: seasons.id }).from(seasons).where(eq(seasons.Status, 'running')).limit(1);
  const [pool] = await db().select({ id: pools.id }).from(pools).where(eq(pools.SeasonId, season!.id)).limit(1);
  await timed('one pool table', () => poolTables(season!.id, pool!.id), (t) => `${t[0]?.rows.length ?? 0} rows`);
  await timed('every pool table of a country', () => poolTables(season!.id), (t) => `${t.length} pools`);

  // 3. Game days, hour by hour, until a league day with matches has been
  // timed (mid-year draws start tomorrow, and some days are cup days).
  if (process.env.SCALE_SKIP_MATCHES !== '1') {
    for (let d = 0; d < 4; d++) {
      let busiest = 0;
      let busiestHour = 0;
      const played = await timed(
        `game day ${d} (24 hourly ticks)`,
        async () => {
          let n = 0;
          for (let h = 0; h < 24; h++) {
            const t = Date.now();
            const r = await runWorldHour();
            n += r.matches.simulated;
            if (Date.now() - t > busiest) [busiest, busiestHour] = [Date.now() - t, h];
          }
          return n;
        },
        (n) => `${n} matches; slowest hour h${busiestHour} ${(busiest / 1000).toFixed(1)} s`
      );
      if (played > 0) break;
    }
  }

  // 4. Year end: claim the year as over and run the next day. With
  // SCALE_SKIP_MATCHES=1 the sim service is deliberately absent, so run only
  // the year-end hour: a full runWorldDay would otherwise retry the
  // unavailable sim 3x for every one of the ~5,000 kickoffs on the next day.
  //
  // At 100k the year end is a separate bottleneck from founding (its per-club
  // steps - club ratings, youth intake, progression - are O(clubs) and are not
  // part of the founding rate). SCALE_SKIP_YEAR_END=1 skips it so a 100k
  // founding run can be timed on its own.
  if (process.env.SCALE_SKIP_YEAR_END === '1') {
    results.push(['year end', 'skipped (SCALE_SKIP_YEAR_END=1)']);
    results.push(['editions running after redraw', 'not run']);
  } else {
    const [cal] = await db().select().from(calendars).limit(1);
    await db().update(calendars).set({ YearStartDay: cal!.CurrentDay - cal!.YearLengthDays, CurrentHour: 0 });
    const skipMatches = process.env.SCALE_SKIP_MATCHES === '1';
    await timed(skipMatches ? 'year end (hour 0)' : 'year end + next day', () => (skipMatches ? runWorldHour() : runWorldDay()), (r) =>
      r.yearEnded
        ? `${r.yearEnded.pyramids.finished} pyramids finished, ${r.yearEnded.pyramids.drawn} drawn, ${r.yearEnded.pyramids.promoted} up / ${r.yearEnded.pyramids.relegated} down; errors: ${r.yearEnded.errors.length}`
        : 'no year end'
    );
    const drawn = await db().select({ n: sql<number>`count(*)::int` }).from(seasons).where(and(eq(seasons.Status, 'running'), isNotNull(seasons.EndDay)));
    results.push(['editions running after redraw', String(drawn[0]!.n)]);
  }

  console.log('\n| Step | Result |\n| --- | --- |');
  for (const [k, v] of results) console.log(`| ${k} | ${v} |`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
