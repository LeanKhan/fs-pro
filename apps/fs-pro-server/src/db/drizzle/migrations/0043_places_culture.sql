-- 0043_places_culture.sql
--
-- Phase 2, Batch 2, Agent 2B (L12). Cultures are data, not DB rows: worldgen
-- (services/worldgen/names/data/cultures/, country_cultures.json) owns the
-- culture banks, and a country (or a place inside one) carries the id of its
-- primary culture as text. So this is a plain text column, not a foreign key
-- into a cultures table that does not exist (OWNER-PROGRAM-SPEC §9.2).
--
-- Backfill (L12): a country gets its primary culture; a region/city/district
-- inherits its country's. Primary cultures come from
-- services/worldgen/names/data/misc/country_cultures.json (the `culture`
-- field of each country entry), matched on the country Code, with a Name
-- fallback for any row whose code drifted.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + `WHERE "CultureId" IS NULL`.

ALTER TABLE "Places" ADD COLUMN IF NOT EXISTS "CultureId" text;

-- Countries first: the base of every inheritance chain.
UPDATE "Places" c SET "CultureId" = CASE
  WHEN upper(c."Code") = 'ASH'  OR lower(c."Name") = 'ashter'     THEN 'karsh'
  WHEN upper(c."Code") = 'BELL' OR lower(c."Name") = 'bellean'    THEN 'karsh'
  WHEN upper(c."Code") = 'EKH'  OR lower(c."Name") = 'ekhastan'   THEN 'karsh'
  WHEN upper(c."Code") = 'HUN'  OR lower(c."Name") = 'hunteerland' THEN 'hunterlaan'
  WHEN upper(c."Code") = 'KEV'  OR lower(c."Name") = 'kev'        THEN 'kev'
  WHEN upper(c."Code") = 'KIY'  OR lower(c."Name") = 'kiyoto'     THEN 'kiyoto'
  WHEN upper(c."Code") = 'PRG'  OR lower(c."Name") = 'pregge'     THEN 'pregge'
  WHEN upper(c."Code") = 'PRO'  OR lower(c."Name") = 'proland'    THEN 'proland'
  WHEN upper(c."Code") = 'SIM'  OR lower(c."Name") IN ('simeone', 'simeon') THEN 'legardio'
  WHEN upper(c."Code") = 'LEG'  OR lower(c."Name") = 'legardio'   THEN 'legardio'
  WHEN upper(c."Code") = 'UPP'  OR lower(c."Name") IN ('upp', 'palaba', 'galli') THEN 'inga'
  ELSE NULL END
WHERE c."Type" = 'country' AND c."CultureId" IS NULL;

-- Regions and cities sit directly under their country (openPlaces: a city's
-- ParentId is the country).
UPDATE "Places" x SET "CultureId" = p."CultureId"
FROM "Places" p
WHERE x."Type" IN ('region', 'city', 'town')
  AND x."CultureId" IS NULL
  AND x."ParentId" = p."_id"
  AND p."Type" = 'country'
  AND p."CultureId" IS NOT NULL;

-- Districts sit under their city; inherit the city's culture.
UPDATE "Places" d SET "CultureId" = p."CultureId"
FROM "Places" p
WHERE d."Type" = 'district'
  AND d."CultureId" IS NULL
  AND d."ParentId" = p."_id"
  AND p."CultureId" IS NOT NULL;
