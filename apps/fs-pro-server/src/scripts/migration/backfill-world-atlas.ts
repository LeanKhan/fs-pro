import 'dotenv/config';
import { createDrizzleConnection } from '../../db/drizzle/client';
import { suggestTownSpot, type AtlasPoint, type TownTerrain } from '@repo/api-contract';

/**
 * Puts the original world on the atlas (run after 0033, before the pyramid).
 * Idempotent:
 *  - every country without a map spot gets one (west / east of the middle
 *    sea, the known ones at hand-picked spots) and colours;
 *  - every club city (Clubs.Address.City) becomes a city Place under the
 *    club's country plus a district (migration 0038 / WORLD-HIERARCHY-SPEC
 *    §2.1), and the club gets DistrictId;
 *  - each club's campus layout follows its city's terrain.
 * `--dry` prints the plan without writing. `--relayout` re-spaces the
 * original world's cities (never player-founded ones) with the current
 * spacing rules.
 *
 * On a world that has already had 0038 applied, clubs have DistrictId and
 * cities/districts already exist, so the script is a no-op.
 */

const KNOWN_SPOTS: Record<string, [number, number]> = {
  KEV: [360, 450],
  LEG: [170, 230],
  HUN: [560, 200],
  PRO: [160, 680],
  PRG: [520, 720],
  UPP: [720, 460],
  BELL: [1230, 450],
  EKH: [1050, 210],
  KIY: [1430, 220],
  ASH: [1060, 720],
  SIM: [1440, 690],
};

const COUNTRY_COLORS: [string, string][] = [
  ['#2f8a1c', '#f5b82e'],
  ['#1f4fa3', '#f2f2ee'],
  ['#d8342c', '#f2f2ee'],
  ['#6a3fb5', '#f5b82e'],
  ['#13795b', '#f2f2ee'],
  ['#f08a1c', '#14204a'],
  ['#8e1b2b', '#f5b82e'],
  ['#2fb3a6', '#14204a'],
  ['#c2389b', '#f2f2ee'],
  ['#3a8ee0', '#f5b82e'],
  ['#8a5a3b', '#f2f2ee'],
];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

export function terrainForTownName(name: string): TownTerrain {
  const n = name.toLowerCase();
  if (/(port|sea|bay|coast|harbo|haven|shore|beach|cove|marm)/.test(n)) return 'coastal';
  if (/(hill|mount|stone|peak|ridge|storr|crag|high|vale)/.test(n)) return 'hillside';
  return (['city', 'coastal', 'hillside'] as const)[hash(n) % 3]!;
}

const slug = (s: string) =>
  s
    .toUpperCase()
    .normalize('NFKD')
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 10);

async function main() {
  const dry = process.argv.includes('--dry');
  const { client: sql } = createDrizzleConnection();
  try {
    const countries = await sql<
      { id: string; Name: string; Code: string; Region: string | null; MapX: number | null; MapY: number | null; Colors: unknown }[]
    >`SELECT "_id" AS id, "Name", "Code", "Region", "MapX", "MapY", "Colors" FROM "Places" WHERE "Type" = 'country' ORDER BY "Name"`;

    // 1. Country spots and colours.
    const taken: AtlasPoint[] = countries.filter((c) => c.MapX != null).map((c) => ({ x: c.MapX!, y: c.MapY! }));
    let spare = 0;
    for (const [i, c] of countries.entries()) {
      if (c.MapX != null && c.Colors) continue;
      const known = KNOWN_SPOTS[c.Code];
      const spot = known
        ? { x: known[0], y: known[1] }
        : { x: 800 + (spare % 2 ? 1 : -1) * 60, y: 160 + 180 * spare++ };
      const colors = COUNTRY_COLORS[i % COUNTRY_COLORS.length]!;
      console.log(`country ${c.Name.padEnd(12)} -> (${spot.x}, ${spot.y}) ${colors.join('/')}`);
      if (!dry) {
        await sql`UPDATE "Places" SET "MapX" = COALESCE("MapX", ${spot.x}), "MapY" = COALESCE("MapY", ${spot.y}),
          "Colors" = COALESCE("Colors", ${JSON.stringify(colors)}::jsonb), "updatedAt" = now() WHERE "_id" = ${c.id}`;
      }
      c.MapX ??= spot.x;
      c.MapY ??= spot.y;
      taken.push(spot);
    }
    const centre = new Map(countries.map((c) => [c.id, { x: c.MapX!, y: c.MapY! }]));

    // 1b. Re-space the original cities (player-founded cities never move).
    if (process.argv.includes('--relayout')) {
      const fixed = await sql<{ x: number; y: number }[]>`
        SELECT "MapX" AS x, "MapY" AS y FROM "Places" WHERE "Type" = 'city' AND "FoundedBy" IS NOT NULL`;
      const placed: AtlasPoint[] = [...fixed];
      for (const c of countries) {
        const own = await sql<{ id: string; Name: string }[]>`
          SELECT "_id" AS id, "Name" FROM "Places" WHERE "Type" = 'city' AND "ParentId" = ${c.id} AND "FoundedBy" IS NULL
          ORDER BY (SELECT count(*) FROM "Places" d WHERE d."ParentId" = "Places"."_id" AND d."Type" = 'district') DESC, "Name"`;
        const others = countries.filter((o) => o.id !== c.id).map((o) => centre.get(o.id)!);
        for (const [i, t] of own.entries()) {
          const spot = suggestTownSpot(centre.get(c.id)!, placed, others, i * 3);
          if (!spot) {
            console.log(`  ! ${c.Name} has no room left for ${t.Name}`);
            continue;
          }
          placed.push(spot);
          if (!dry) await sql`UPDATE "Places" SET "MapX" = ${spot.x}, "MapY" = ${spot.y}, "updatedAt" = now() WHERE "_id" = ${t.id}`;
        }
        if (own.length) console.log(`relayout ${c.Name}: ${own.length} city(ies)`);
      }
    }

    // 2. Cities (and a district each) from club cities.
    const clubs = await sql<{ id: string; Name: string; country: string | null; city: string | null; DistrictId: string | null }[]>`
      SELECT "_id" AS id, "Name", "AddressCountryId" AS country, trim("Address"->>'City') AS city, "DistrictId"
      FROM "Clubs" ORDER BY "Name"`;
    const cities = await sql<{ id: string; ParentId: string; Name: string; MapX: number; MapY: number }[]>`
      SELECT "_id" AS id, "ParentId", "Name", "MapX", "MapY" FROM "Places" WHERE "Type" = 'city'`;
    const cityKey = (countryId: string, name: string) => `${countryId}:${name.toLowerCase()}`;
    const cityByKey = new Map(cities.map((t) => [cityKey(t.ParentId, t.Name), t]));
    const spots: AtlasPoint[] = cities.map((t) => ({ x: t.MapX, y: t.MapY }));
    const codes = new Set((await sql<{ Code: string }[]>`SELECT "Code" FROM "Places"`).map((r) => r.Code));
    let created = 0;
    let linked = 0;

    for (const club of clubs) {
      if (club.DistrictId || !club.country || !club.city) {
        if (!club.DistrictId) console.log(`  ! ${club.Name}: no country or city, left unplaced`);
        continue;
      }
      const country = countries.find((c) => c.id === club.country)!;
      let city = cityByKey.get(cityKey(country.id, club.city));
      if (!city) {
        const others = countries.filter((c) => c.id !== country.id).map((c) => centre.get(c.id)!);
        const spot = suggestTownSpot(centre.get(country.id)!, spots, others, hash(club.city) % 7);
        if (!spot) {
          console.log(`  ! ${country.Name} is full, ${club.city} left unplaced`);
          continue;
        }
        let code = `${country.Code}-${slug(club.city)}`;
        for (let n = 2; codes.has(code); n++) code = `${country.Code}-${slug(club.city)}${n}`;
        codes.add(code);
        const terrain = terrainForTownName(club.city);
        console.log(`city ${club.city.padEnd(15)} in ${country.Name.padEnd(8)} (${spot.x}, ${spot.y}) ${terrain}`);
        city = { id: '', ParentId: country.id, Name: club.city, MapX: spot.x, MapY: spot.y };
        if (!dry) {
          const [row] = await sql<{ id: string }[]>`
            INSERT INTO "Places" ("Fullname", "Name", "Code", "Region", "Type", "ParentId", "MapX", "MapY", "Terrain", "updatedAt")
            VALUES (${`${club.city}, ${country.Name}`}, ${club.city}, ${code}, ${country.Region}, 'city', ${country.id},
                    ${spot.x}, ${spot.y}, ${terrain}, now())
            RETURNING "_id" AS id`;
          city.id = row!.id;
        }
        cityByKey.set(cityKey(country.id, club.city), city);
        spots.push(spot);
        created++;
      }
      // Each city owns at least one district; clubs attach to a district.
      let [district] = await sql<{ id: string }[]>`
        SELECT "_id" AS id FROM "Places" WHERE "Type" = 'district' AND "ParentId" = ${city.id} ORDER BY "createdAt" ASC LIMIT 1`;
      if (!district && !dry) {
        let dcode = `${city.Name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8)}-D`;
        for (let n = 2; codes.has(dcode); n++) dcode = `${dcode}${n}`;
        codes.add(dcode);
        [district] = await sql<{ id: string }[]>`
          INSERT INTO "Places" ("Fullname", "Name", "Code", "Region", "Type", "ParentId", "MapX", "MapY", "Terrain", "updatedAt")
          VALUES (${`${city.Name} Central, ${city.Name}`}, ${`${city.Name} Central`}, ${dcode}, ${country.Region}, 'district', ${city.id},
                  ${city.MapX}, ${city.MapY}, ${terrainForTownName(city.Name)}, now())
          RETURNING "_id" AS id`;
      }
      if (!dry && district) {
        await sql`UPDATE "Clubs" SET "DistrictId" = ${district.id},
          "CampusLayout" = (SELECT COALESCE("Terrain", 'city') FROM "Places" WHERE "_id" = ${district.id}),
          "updatedAt" = now() WHERE "_id" = ${club.id}`;
      }
      linked++;
    }
    console.log(`${dry ? '[dry] ' : ''}${created} city(ies) created, ${linked} club(s) linked`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
