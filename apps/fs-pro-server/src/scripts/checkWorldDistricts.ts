import 'dotenv/config';
import assert from 'assert';
import postgres from 'postgres';

/**
 * Committed tested-backfill check for migration 0038 (WORLD-HIERARCHY-SPEC
 * §2.3, R7). Run it on a COPY OF A REAL DATABASE (a data clone); it refuses
 * the dev database by name and an empty world.
 *
 * The migration repoints rows in place and renames columns/tables, so the
 * "before" values are gone once 0038 has run. The check therefore runs in two
 * steps against the same scratch clone:
 *
 *   # 1. before applying 0038, snapshot the old world into the clone
 *   DATABASE_URL=postgres://.../scratch \
 *     npx ts-node --transpile-only src/scripts/checkWorldDistricts.ts --capture
 *
 *   # 2. apply 0038 (the normal runner, or `psql -1 -f 0038_world_districts.sql`)
 *
 *   # 3. assert the §2.3 checklist
 *   DATABASE_URL=postgres://.../scratch \
 *     npx ts-node --transpile-only src/scripts/checkWorldDistricts.ts
 *
 * Step 1 writes three small tables (`check_world_districts_meta/_towns/
 * _invites`) into the clone; the migration never touches them. Step 3 reads
 * them and asserts:
 *   - every old `Type='town'` row is now `Type='city'` with exactly one
 *     `Type='district'` child, and no `town` rows remain;
 *   - no NEW null `Clubs.DistrictId` (the post count equals the captured
 *     pre count) and every `DistrictId` is a district whose parent is a city;
 *   - `PlaceStats` equals `GROUP BY Clubs.DistrictId` for every district;
 *   - the `PlaceInvites` count is preserved and every invite points at a
 *     district of the old town it was created for;
 *   - `Calendars.DistrictClubs/RegionCities` keep the old `TownSize/RegionTowns`
 *     values;
 *   - the frontier pointer (D3) is internally consistent: the country is a
 *     country, and a region/city pointer is null only when that level does not
 *     exist under the frontier (an empty newest country legitimately has no
 *     region/city to point at).
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required (point it at a scratch data clone)');

const sql = postgres(url, { max: 1, onnotice: () => {} });
const captureMode = process.argv.includes('--capture');

let passed = 0;
function ok(name: string) {
  passed++;
  console.log(`  ok  ${name}`);
}

type Meta = {
  townCount: number;
  clubCount: number;
  nullTownCount: number;
  inviteCount: number;
  townSize: number | null;
  regionTowns: number | null;
};

async function dbName(): Promise<string> {
  const [row] = await sql<{ name: string }[]>`SELECT current_database() AS name`;
  return row!.name;
}

async function hasColumn(table: string, column: string): Promise<boolean> {
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}`;
  return row!.n > 0;
}

async function capture() {
  const name = await dbName();
  if (name === 'fspro') throw new Error('Refusing to run against the dev database "fspro"; use a scratch clone');
  if (await hasColumn('Clubs', 'DistrictId')) {
    throw new Error('0038 is already applied: capture must run against a pre-migration clone');
  }
  const [clubsEmpty] = await sql<{ n: number }[]>`SELECT (count(*) = 0)::int AS n FROM "Clubs"`;
  if (clubsEmpty!.n === 1) {
    throw new Error('Refusing to run: the Clubs table is empty (clone a real database so the backfill has rows)');
  }

  await sql`DROP TABLE IF EXISTS check_world_districts_meta`;
  await sql`DROP TABLE IF EXISTS check_world_districts_towns`;
  await sql`DROP TABLE IF EXISTS check_world_districts_invites`;
  await sql`CREATE TABLE check_world_districts_meta (key text PRIMARY KEY, value jsonb NOT NULL)`;
  await sql`CREATE TABLE check_world_districts_towns (id uuid PRIMARY KEY)`;
  await sql`CREATE TABLE check_world_districts_invites (invite_id uuid PRIMARY KEY, old_town_id uuid NOT NULL)`;

  const towns = await sql<{ id: string }[]>`SELECT "_id" AS id FROM "Places" WHERE "Type" = 'town' ORDER BY "_id"`;
  const [counts] = await sql<{ clubs: number; nulls: number }[]>`
    SELECT count(*)::int AS clubs, count(*) FILTER (WHERE "TownId" IS NULL)::int AS nulls FROM "Clubs"`;
  const invites = await sql<{ id: string; town: string }[]>`
    SELECT "_id" AS id, "TownId" AS town FROM "TownInvites" ORDER BY "_id"`;
  const [cal] = await sql<{ size: number; regions: number }[]>`
    SELECT "TownSize" AS size, "RegionTowns" AS regions FROM "Calendars" LIMIT 1`;

  const meta: Meta = {
    townCount: towns.length,
    clubCount: counts!.clubs,
    nullTownCount: counts!.nulls,
    inviteCount: invites.length,
    townSize: cal?.size ?? null,
    regionTowns: cal?.regions ?? null,
  };
  for (const [key, value] of Object.entries(meta)) {
    await sql`INSERT INTO check_world_districts_meta (key, value) VALUES (${key}, ${sql.json(value)})`;
  }
  if (towns.length) {
    await sql`INSERT INTO check_world_districts_towns ${sql(towns.map((t) => ({ id: t.id })), 'id')}`;
  }
  if (invites.length) {
    await sql`INSERT INTO check_world_districts_invites ${sql(
      invites.map((i) => ({ invite_id: i.id, old_town_id: i.town })),
      'invite_id',
      'old_town_id',
    )}`;
  }

  console.log(
    `captured: ${meta.townCount} town(s), ${meta.clubCount} club(s) (${meta.nullTownCount} null TownId), ` +
      `${meta.inviteCount} invite(s), capacities ${meta.townSize}/${meta.regionTowns}`,
  );
  console.log('now apply 0038, then re-run without --capture');
}

async function readMeta(): Promise<Meta> {
  const [exists] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'check_world_districts_meta'`;
  if (exists!.n === 0) {
    throw new Error('No capture found: run with --capture on the pre-migration clone before applying 0038');
  }
  const rows = await sql<{ key: string; value: unknown }[]>`SELECT key, value FROM check_world_districts_meta`;
  const meta = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown>;
  return {
    townCount: meta.townCount as number,
    clubCount: meta.clubCount as number,
    nullTownCount: meta.nullTownCount as number,
    inviteCount: meta.inviteCount as number,
    townSize: meta.townSize as number | null,
    regionTowns: meta.regionTowns as number | null,
  };
}

async function scalar(query: postgres.PendingQuery<postgres.Row[]>): Promise<number> {
  const rows = await query;
  return Number((rows[0] as { n: number }).n);
}

async function check() {
  const name = await dbName();
  if (name === 'fspro') throw new Error('Refusing to run against the dev database "fspro"; use a scratch clone');
  if (!(await hasColumn('Clubs', 'DistrictId'))) {
    throw new Error('0038 is not applied: run --capture, apply 0038, then re-run');
  }
  const meta = await readMeta();

  // 1. towns -> cities with exactly one district.
  const townsGone = await scalar(sql`SELECT count(*)::int AS n FROM "Places" WHERE "Type" = 'town'`);
  assert.strictEqual(townsGone, 0, 'old town rows must be renamed to city');
  ok(`towns_gone: 0 (captured ${meta.townCount} old town(s))`);

  const townsBad = await scalar(sql`
    SELECT count(*)::int AS n FROM check_world_districts_towns t
    LEFT JOIN "Places" c ON c."_id" = t.id
    WHERE c."_id" IS NULL OR c."Type" <> 'city'
       OR (SELECT count(*) FROM "Places" d WHERE d."ParentId" = t.id AND d."Type" = 'district') <> 1`);
  assert.strictEqual(townsBad, 0, 'every old town must be a city with exactly one district');
  ok(`each old town is a city with exactly one district (${meta.townCount}/${meta.townCount})`);

  const cities = await scalar(sql`SELECT count(*)::int AS n FROM "Places" WHERE "Type" = 'city'`);
  assert.ok(cities >= meta.townCount, 'no old town may be lost');
  const citiesWithoutDistrict = await scalar(sql`
    SELECT count(*)::int AS n FROM "Places" c
    WHERE c."Type" = 'city' AND NOT EXISTS (SELECT 1 FROM "Places" d WHERE d."ParentId" = c."_id" AND d."Type" = 'district')`);
  assert.strictEqual(citiesWithoutDistrict, 0, 'every city must keep at least one district');
  ok(`cities ${cities} (>= ${meta.townCount}), every city has a district`);

  // 2. Clubs repointed to districts; no NEW null DistrictId.
  const [clubs] = await sql<{ n: number; nulls: number }[]>`
    SELECT count(*)::int AS n, count(*) FILTER (WHERE "DistrictId" IS NULL)::int AS nulls FROM "Clubs"`;
  assert.strictEqual(clubs!.n, meta.clubCount, 'no club may be lost');
  assert.strictEqual(
    clubs!.nulls,
    meta.nullTownCount,
    `null DistrictId count changed (was ${meta.nullTownCount}, now ${clubs!.nulls})`,
  );
  ok(`clubs ${clubs!.n}, null DistrictId preserved at ${clubs!.nulls} (${meta.nullTownCount} before)`);

  const badParents = await scalar(sql`
    SELECT count(*)::int AS n FROM "Clubs" c
    LEFT JOIN "Places" d ON d."_id" = c."DistrictId"
    LEFT JOIN "Places" ci ON ci."_id" = d."ParentId"
    WHERE c."DistrictId" IS NOT NULL AND (d."_id" IS NULL OR d."Type" <> 'district' OR ci."_id" IS NULL OR ci."Type" <> 'city')`);
  assert.strictEqual(badParents, 0, 'every DistrictId must be a district whose parent is a city');
  ok('every DistrictId is a district whose parent is a city');

  // 3. PlaceStats projection.
  const statsMismatch = await scalar(sql`
    SELECT count(*)::int AS n FROM (
      SELECT d."_id", COALESCE(ps."Clubs", -1) AS projected,
             (SELECT count(*) FROM "Clubs" c WHERE c."DistrictId" = d."_id") AS actual
      FROM "Places" d LEFT JOIN "PlaceStats" ps ON ps."PlaceId" = d."_id"
      WHERE d."Type" = 'district'
    ) x WHERE projected <> actual`);
  assert.strictEqual(statsMismatch, 0, 'PlaceStats must equal GROUP BY Clubs.DistrictId for every district');
  const statsRows = await scalar(sql`SELECT count(*)::int AS n FROM "PlaceStats"`);
  const districts = await scalar(sql`SELECT count(*)::int AS n FROM "Places" WHERE "Type" = 'district'`);
  assert.strictEqual(statsRows, districts, 'every district has a PlaceStats row');
  ok(`PlaceStats matches GROUP BY Clubs.DistrictId (${statsRows} district rows)`);

  // 4. Invites preserved and repointed.
  const inviteCount = await scalar(sql`SELECT count(*)::int AS n FROM "PlaceInvites"`);
  assert.strictEqual(inviteCount, meta.inviteCount, 'PlaceInvites count must be preserved');
  const invitesBad = inviteCount
    ? await scalar(sql`
        SELECT count(*)::int AS n FROM check_world_districts_invites m
        LEFT JOIN "PlaceInvites" pi ON pi."_id" = m.invite_id
        LEFT JOIN "Places" d ON d."_id" = pi."PlaceId"
        WHERE pi."_id" IS NULL OR d."Type" <> 'district' OR d."ParentId" <> m.old_town_id`)
    : 0;
  assert.strictEqual(invitesBad, 0, 'every invite must point at a district of its old town');
  const oldInviteTable = await scalar(sql`
    SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'TownInvites'`);
  assert.strictEqual(oldInviteTable, 0, 'TownInvites must be renamed');
  const badLevel = await scalar(sql`SELECT count(*)::int AS n FROM "PlaceInvites" WHERE "Level" <> 'district'`);
  assert.strictEqual(badLevel, 0, 'every migrated invite must have Level=district');
  ok(`PlaceInvites ${inviteCount}/${meta.inviteCount} preserved, repointed to their old town's district, Level=district`);

  // 5. Calendars capacities keep the old values.
  const [cal] = await sql<{ size: number | null; regions: number | null }[]>`
    SELECT "DistrictClubs" AS size, "RegionCities" AS regions FROM "Calendars" LIMIT 1`;
  assert.strictEqual(cal!.size, meta.townSize, 'DistrictClubs must keep old TownSize');
  assert.strictEqual(cal!.regions, meta.regionTowns, 'RegionCities must keep old RegionTowns');
  ok(`Calendars DistrictClubs/RegionCities kept ${meta.townSize}/${meta.regionTowns}`);

  // 6. Supporting schema (spec §2.3 items 6-9).
  const tableCount = await scalar(sql`
    SELECT count(*)::int AS n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('PlaceInvites', 'PlaceStats', 'TileRevisions')`);
  assert.strictEqual(tableCount, 3, 'PlaceInvites, PlaceStats and TileRevisions must exist');
  const townScope = await scalar(sql`SELECT count(*)::int AS n FROM "NewsItems" WHERE "ScopeType" = 'town'`);
  assert.strictEqual(townScope, 0, "legacy 'town' news scope must become 'district'");
  const prominenceBad = await scalar(sql`SELECT count(*)::int AS n FROM "Clubs" WHERE "Prominence" < 0 OR "Prominence" > 100`);
  assert.strictEqual(prominenceBad, 0, 'Prominence must be within 0..100');
  ok('PlaceInvites/PlaceStats/TileRevisions present, news scope migrated, Prominence in range');

  // 7. Frontier pointer (D3): consistent, and null only when the level is absent.
  const [frontier] = await sql<{
    country_id: string | null;
    region_id: string | null;
    city_id: string | null;
    country_type: string | null;
    region_parent: string | null;
    city_parent: string | null;
    country_regions: number;
    region_cities: number;
  }[]>`
    SELECT
      cal."FrontierCountryId"::text AS country_id,
      cal."FrontierRegionId"::text AS region_id,
      cal."FrontierCityId"::text AS city_id,
      (SELECT "Type" FROM "Places" WHERE "_id" = cal."FrontierCountryId") AS country_type,
      (SELECT r."ParentId"::text FROM "Places" r WHERE r."_id" = cal."FrontierRegionId") AS region_parent,
      (SELECT c."ParentId"::text FROM "Places" c WHERE c."_id" = cal."FrontierCityId") AS city_parent,
      (SELECT count(*)::int FROM "Places" r WHERE r."Type" = 'region' AND r."ParentId" = cal."FrontierCountryId") AS country_regions,
      (SELECT count(*)::int FROM "Places" c WHERE c."Type" = 'city' AND c."ParentId" = cal."FrontierRegionId") AS region_cities
    FROM "Calendars" cal
    LIMIT 1`;
  if (frontier && frontier.country_id !== null) {
    assert.strictEqual(frontier.country_type, 'country', 'FrontierCountryId must point at a country');
    if (frontier.region_id !== null) {
      assert.strictEqual(frontier.region_parent, frontier.country_id, 'FrontierRegionId must be a region of the frontier country');
      assert.ok(frontier.country_regions > 0, 'a set FrontierRegionId implies the country has a region');
    } else {
      assert.strictEqual(frontier.country_regions, 0, 'FrontierRegionId is null only when the frontier country has no regions');
    }
    if (frontier.city_id !== null) {
      assert.strictEqual(frontier.city_parent, frontier.region_id, 'FrontierCityId must be a city of the frontier region');
      assert.ok(frontier.region_cities > 0, 'a set FrontierCityId implies the region has a city');
    } else {
      assert.strictEqual(frontier.region_cities, 0, 'FrontierCityId is null only when the frontier region has no cities');
    }
    ok('frontier pointer consistent; region/city null only when that level is empty (D3)');
  }

  console.log(`\n${passed} checks passed`);
}

async function main() {
  if (captureMode) await capture();
  else await check();
}

main()
  .then(() => sql.end())
  .catch(async (err) => {
    console.error(err);
    await sql.end();
    process.exit(1);
  });
