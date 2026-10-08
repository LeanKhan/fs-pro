import 'dotenv/config';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';

/**
 * Phase 2 B2-2B migration backfill check (L3/L12). Runs against a COPY of the
 * dev schema that still predates 0042/0043 and already has real rows, then
 * applies 0042_owner_program.sql and 0043_places_culture.sql and proves:
 *
 *   - Clubs / Entries / Players / Managers / Places counts are unchanged;
 *   - every existing club's Budget, ManagerId and XP are byte-for-byte the
 *     same (a checksum over the whole table), and every club now has an
 *     OwnerProgram row marked 'done';
 *   - every existing manager has attributes, an overall, a fee and a wage;
 *   - every free agent has a FreeAgentSince anchor;
 *   - every existing place with a country chain has a culture;
 *   - re-running both files changes nothing (idempotent guards).
 *
 *   DATABASE_URL=postgres://fspro:...@localhost:5434/fspro_b2b2b_mig \
 *     npx ts-node --transpile-only src/scripts/checkProgramMigrations.ts
 */

let passed = 0;
function ok(name: string) {
  passed++;
  console.log(`  ok  ${name}`);
}

const FORBIDDEN = new Set(['fspro', 'postgres', 'template1']);
const MIGRATIONS = ['0042_owner_program.sql', '0043_places_culture.sql'];
const dir = path.join(__dirname, '../db/drizzle/migrations');

async function scalar<T = number>(sql: postgres.Sql, query: string): Promise<T> {
  const rows = await sql.unsafe(query);
  return rows[0] ? (Object.values(rows[0] as Record<string, unknown>)[0] as T) : (undefined as T);
}

async function counts(sql: postgres.Sql) {
  return {
    clubs: await scalar<number>(sql, 'SELECT count(*)::int FROM "Clubs"'),
    entries: await scalar<number>(sql, 'SELECT count(*)::int FROM "Entries"'),
    players: await scalar<number>(sql, 'SELECT count(*)::int FROM "Players"'),
    managers: await scalar<number>(sql, 'SELECT count(*)::int FROM "Managers"'),
    places: await scalar<number>(sql, 'SELECT count(*)::int FROM "Places"'),
  };
}

type ClubSnapshot = { digest: string; budgetSum: number; managerIdCount: number; xpSum: number };

async function clubSnapshot(sql: postgres.Sql): Promise<ClubSnapshot> {
  return {
    digest: await scalar<string>(
      sql,
      `SELECT md5(coalesce(string_agg(t.txt, '|' ORDER BY t.id), '')) AS digest FROM (
         SELECT "_id"::text AS id,
                concat_ws(':', "_id", "Budget", "ManagerId", "XP", "ClubCode", "Name") AS txt
         FROM "Clubs") t`
    ),
    budgetSum: await scalar<number>(sql, 'SELECT coalesce(sum("Budget"), 0)::float8 FROM "Clubs"'),
    managerIdCount: await scalar<number>(sql, 'SELECT count("ManagerId")::int FROM "Clubs"'),
    xpSum: await scalar<number>(sql, 'SELECT coalesce(sum("XP"), 0)::int FROM "Clubs"'),
  };
}

async function apply(sql: postgres.Sql, file: string) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  await sql.begin(async (tx) => {
    await tx.unsafe(text);
  });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (FORBIDDEN.has(dbName)) {
    throw new Error(`Refusing to run on "${dbName}" - use a scratch database copy`);
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    // A pre-0042 copy has no OwnerProgram yet.
    const hasOwnerProgram = await scalar<boolean>(sql, `SELECT to_regclass('"OwnerProgram"') IS NOT NULL`);
    if (hasOwnerProgram) {
      throw new Error('OwnerProgram already exists - this must be a pre-0042 dev-schema copy');
    }
    assert.ok((await scalar<number>(sql, 'SELECT count(*)::int FROM "Clubs"')) > 0, 'the copy has existing clubs');
    assert.ok((await scalar<number>(sql, 'SELECT count(*)::int FROM "Places"')) > 0, 'the copy has existing places');

    const before = await counts(sql);
    const clubsBefore = await clubSnapshot(sql);
    console.log('before', before, clubsBefore);
    ok(`copy has ${before.clubs} clubs, ${before.places} places, ${before.managers} managers to preserve`);

    await apply(sql, MIGRATIONS[0]!);
    await apply(sql, MIGRATIONS[1]!);
    ok('0042 and 0043 applied');

    const after = await counts(sql);
    const clubsAfter = await clubSnapshot(sql);
    console.log('after', after, clubsAfter);

    // -- Counts: everything is preserved. -------------------------------------
    assert.strictEqual(after.clubs, before.clubs, 'Clubs count changed');
    assert.strictEqual(after.entries, before.entries, 'Entries count changed');
    assert.strictEqual(after.players, before.players, 'Players count changed');
    assert.strictEqual(after.managers, before.managers, 'Managers count changed');
    assert.strictEqual(after.places, before.places, 'Places count changed');
    ok('existing row counts unchanged (Clubs, Entries, Players, Managers, Places)');

    assert.strictEqual(clubsAfter.digest, clubsBefore.digest, 'a club column mutated');
    assert.strictEqual(clubsAfter.budgetSum, clubsBefore.budgetSum, 'a club budget changed');
    assert.strictEqual(clubsAfter.managerIdCount, clubsBefore.managerIdCount, 'a club manager changed');
    assert.strictEqual(clubsAfter.xpSum, clubsBefore.xpSum, 'club XP changed');
    ok('every existing club kept Budget, ManagerId, XP, name and code (table checksum identical)');

    // -- OwnerProgram: one row per club, all done (L3). -----------------------
    const programRows = await scalar<number>(sql, 'SELECT count(*)::int FROM "OwnerProgram"');
    assert.strictEqual(programRows, before.clubs, 'not every club got a program row');
    const done = await scalar<number>(sql, `SELECT count(*)::int FROM "OwnerProgram" WHERE "Step" = 'done'`);
    assert.strictEqual(done, before.clubs, 'not every existing club is program-complete');
    ok(`${programRows} OwnerProgram rows, all 'done'`);

    // -- Managers: real-hire attributes, overall, fee, wage. ------------------
    const badManagers = await scalar<number>(
      sql,
      `SELECT count(*)::int FROM "Managers"
       WHERE "Tactics" IS NULL OR "Motivation" IS NULL OR "Development" IS NULL
          OR "Discipline" IS NULL OR "Overall" IS NULL OR "SigningFee" IS NULL OR "Wage" IS NULL`
    );
    assert.strictEqual(badManagers, 0, `${badManagers} managers missing attributes`);
    const attrRange = await scalar<number>(
      sql,
      `SELECT count(*)::int FROM "Managers"
       WHERE "Tactics" NOT BETWEEN 40 AND 90 OR "Discipline" NOT BETWEEN 40 AND 90 OR "Overall" NOT BETWEEN 40 AND 100`
    );
    assert.strictEqual(attrRange, 0, 'manager attributes out of range');
    ok(`all ${before.managers} managers backfilled with attributes, overall, fee and wage`);

    // -- Free agents get a TTL anchor. ----------------------------------------
    const freeAgents = await scalar<number>(
      sql,
      `SELECT count(*)::int FROM "Players" WHERE "isSigned" = false AND "isRetired" = false`
    );
    const anchored = await scalar<number>(
      sql,
      `SELECT count(*)::int FROM "Players"
       WHERE "isSigned" = false AND "isRetired" = false AND "FreeAgentSince" IS NOT NULL`
    );
    assert.strictEqual(anchored, freeAgents, 'a free agent has no FreeAgentSince');
    ok(`${freeAgents} free agents anchored with FreeAgentSince`);

    // -- Places get a culture (L12). ------------------------------------------
    // The 11 starter countries from country_cultures.json must all resolve;
    // any other (founder-created) country legitimately stays null until 1C
    // assigns it one.
    const starterCodes = `('ASH','BELL','EKH','HUN','KEV','KIY','PRG','PRO','SIM','LEG','UPP')`;
    const starterCountries = await scalar<number>(
      sql,
      `SELECT count(*)::int FROM "Places" WHERE "Type" = 'country' AND upper("Code") IN ${starterCodes}`
    );
    const starterWithCulture = await scalar<number>(
      sql,
      `SELECT count(*)::int FROM "Places" WHERE "Type" = 'country' AND upper("Code") IN ${starterCodes} AND "CultureId" IS NOT NULL`
    );
    assert.ok(starterCountries > 0, 'the copy has none of the 11 starter countries');
    assert.strictEqual(starterWithCulture, starterCountries, 'a starter country has no culture');
    // Every non-country whose country chain resolves must have inherited one.
    const orphanCultures = await scalar<number>(
      sql,
      `SELECT count(*)::int FROM "Places" x
       WHERE x."Type" <> 'country' AND x."CultureId" IS NULL
         AND EXISTS (
           SELECT 1 FROM "Places" p
           WHERE p."Type" = 'country' AND p."CultureId" IS NOT NULL
             AND (x."ParentId" = p."_id"
                  OR x."ParentId" IN (SELECT c."_id" FROM "Places" c WHERE c."ParentId" = p."_id")
                  OR x."ParentId" IN (SELECT c."_id" FROM "Places" c WHERE c."ParentId" IN (SELECT g."_id" FROM "Places" g WHERE g."ParentId" = p."_id")))
         )`
    );
    assert.strictEqual(orphanCultures, 0, 'a place with a known country chain has no culture');
    const inherited = await scalar<number>(
      sql,
      `SELECT count(*)::int FROM "Places" WHERE "Type" <> 'country' AND "CultureId" IS NOT NULL`
    );
    ok(`${starterCountries} starter countries resolved; ${inherited} regions/cities/districts inherited a culture`);

    // -- Idempotency: running both again changes nothing. ---------------------
    const beforeRerun = await counts(sql);
    await apply(sql, MIGRATIONS[0]!);
    await apply(sql, MIGRATIONS[1]!);
    const afterRerun = await counts(sql);
    assert.deepStrictEqual(afterRerun, beforeRerun, 'a second run changed row counts');
    assert.strictEqual(
      await scalar<number>(sql, `SELECT count(*)::int FROM "OwnerProgram" WHERE "Step" <> 'done'`),
      0
    );
    ok('re-running 0042 and 0043 is idempotent (guards hold)');

    console.log(`\n${passed} checks passed`);
    process.exit(0);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
