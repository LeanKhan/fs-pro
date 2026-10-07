-- World districts (docs/perfect/WORLD-HIERARCHY-SPEC.md §2.3, owner-approved):
-- the place tree becomes country > region > city > district, clubs belong to a
-- district, placement capacities move to district terms, invites become
-- place-level, and the prominence cache / PlaceStats / TileRevisions the
-- world-service needs are created.
--
-- Data migration: the old `Type='town'` rows become cities, each gets one
-- generated district, and every club is repointed from its city to that
-- district. Nothing is dropped and values are preserved (Q2: existing
-- DistrictClubs/RegionCities keep their old TownSize/RegionTowns values; the
-- *defaults* move to the new tuning numbers, so a fresh world starts at 10/2).
--
-- Idempotent-safe: every rename/add/create is guarded, so re-running the file
-- (the apply script records it once, but a raw replay is safe) is a no-op
-- except for the recomputed backfills. It runs in one transaction
-- (src/scripts/migration/apply-sql-migrations.ts) and never drops a column.

-- ---------------------------------------------------------------------------
-- 1. Rename the town level to city.
-- ---------------------------------------------------------------------------
UPDATE "Places" SET "Type" = 'city' WHERE "Type" = 'town';

-- ---------------------------------------------------------------------------
-- 2. One district per city that has none (the city's spot, terrain, founder
--    and region; auto-named "<City> Central", per Q3/Q8).
-- ---------------------------------------------------------------------------
INSERT INTO "Places" (
  "_id", "Fullname", "Name", "Code", "Region", "Type", "ParentId", "RegionId",
  "FoundedBy", "MapX", "MapY", "Terrain", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  city."Name" || ' Central, ' || city."Name",
  city."Name" || ' Central',
  'D-' || replace(city."_id"::text, '-', ''),
  city."Region",
  'district',
  city."_id",
  city."RegionId",
  city."FoundedBy",
  city."MapX",
  city."MapY",
  city."Terrain",
  now(),
  now()
FROM "Places" city
WHERE city."Type" = 'city'
  AND NOT EXISTS (
    SELECT 1 FROM "Places" d
    WHERE d."ParentId" = city."_id" AND d."Type" = 'district'
  );

-- ---------------------------------------------------------------------------
-- 3. Clubs point at their district. TownId is renamed (not dropped), then
--    repointed city -> district.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'Clubs' AND column_name = 'TownId')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'Clubs' AND column_name = 'DistrictId') THEN
    ALTER TABLE "Clubs" RENAME COLUMN "TownId" TO "DistrictId";
  END IF;
END $$;

UPDATE "Clubs" c
SET "DistrictId" = d."_id"
FROM "Places" city
JOIN "Places" d ON d."ParentId" = city."_id" AND d."Type" = 'district'
WHERE c."DistrictId" = city."_id" AND city."Type" = 'city';

ALTER INDEX IF EXISTS "Clubs_TownId_idx" RENAME TO "Clubs_DistrictId_idx";

-- ---------------------------------------------------------------------------
-- 4. Calendars: placement capacities in district terms plus the frontier
--    pointer. Values are preserved; defaults move to the Q2 numbers.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'Calendars' AND column_name = 'TownSize')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'Calendars' AND column_name = 'DistrictClubs') THEN
    ALTER TABLE "Calendars" RENAME COLUMN "TownSize" TO "DistrictClubs";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'Calendars' AND column_name = 'RegionTowns')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'Calendars' AND column_name = 'RegionCities') THEN
    ALTER TABLE "Calendars" RENAME COLUMN "RegionTowns" TO "RegionCities";
  END IF;
END $$;

ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "DistrictClubs" integer NOT NULL DEFAULT 10;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "RegionCities" integer NOT NULL DEFAULT 8;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "CityDistricts" integer NOT NULL DEFAULT 2;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "MetropolisDistricts" integer NOT NULL DEFAULT 40;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "FrontierCountryId" uuid REFERENCES "Places"("_id");
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "FrontierRegionId" uuid REFERENCES "Places"("_id");
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "FrontierCityId" uuid REFERENCES "Places"("_id");
ALTER TABLE "Calendars" ALTER COLUMN "DistrictClubs" SET DEFAULT 10;
ALTER TABLE "Calendars" ALTER COLUMN "RegionCities" SET DEFAULT 8;

-- Frontier pointer backfill: the newest country, its newest region, and that
-- country's capital (its oldest city -- the one city that may grow to
-- MetropolisDistricts; see WORLD-HIERARCHY-SPEC §3.3).
WITH newest_country AS (
  SELECT c."_id" AS id
  FROM "Places" c WHERE c."Type" = 'country'
  ORDER BY c."createdAt" DESC, c."_id" DESC LIMIT 1
),
newest_region AS (
  SELECT r."_id" AS id FROM "Places" r, newest_country nc
  WHERE r."Type" = 'region' AND r."ParentId" = nc.id
  ORDER BY r."createdAt" DESC, r."_id" DESC LIMIT 1
),
capital AS (
  SELECT ci."_id" AS id FROM "Places" ci, newest_country nc
  WHERE ci."Type" = 'city' AND ci."ParentId" = nc.id
  ORDER BY ci."createdAt" ASC, ci."_id" ASC LIMIT 1
)
UPDATE "Calendars" cal SET
  "FrontierCountryId" = (SELECT id FROM newest_country),
  "FrontierRegionId"  = (SELECT id FROM newest_region),
  "FrontierCityId"    = (SELECT id FROM capital);

-- ---------------------------------------------------------------------------
-- 5. Invites: TownInvites -> PlaceInvites, TownId -> PlaceId, + Level, and
--    every invite repointed from its old town to that town's new district.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'TownInvites')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'PlaceInvites') THEN
    ALTER TABLE "TownInvites" RENAME TO "PlaceInvites";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'PlaceInvites' AND column_name = 'TownId')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'PlaceInvites' AND column_name = 'PlaceId') THEN
    ALTER TABLE "PlaceInvites" RENAME COLUMN "TownId" TO "PlaceId";
  END IF;
END $$;

ALTER TABLE "PlaceInvites" ADD COLUMN IF NOT EXISTS "Level" text NOT NULL DEFAULT 'district';

UPDATE "PlaceInvites" pi
SET "PlaceId" = d."_id"
FROM "Places" city
JOIN "Places" d ON d."ParentId" = city."_id" AND d."Type" = 'district'
WHERE pi."PlaceId" = city."_id" AND city."Type" = 'city';

ALTER INDEX IF EXISTS "town_invites_club_idx" RENAME TO "place_invites_club_idx";

-- ---------------------------------------------------------------------------
-- 6. Prominence cache on Clubs, backfilled with the §5.1 formula from stored
--    fields. Level uses the default 100*n^2 curve (Calendars.LevelThresholds,
--    when custom, is applied by the world-service's recompute).
-- ---------------------------------------------------------------------------
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "Prominence" real NOT NULL DEFAULT 0;
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "ProminenceUpdatedAt" timestamp(3);
CREATE INDEX IF NOT EXISTS "Clubs_Prominence_idx" ON "Clubs" ("Prominence");

UPDATE "Clubs" c SET
  "Prominence" = round((
      100.0 * (
        0.30 * least(greatest((c."Elo" - 1200.0) / 1200.0, 0.0), 1.0)
      + 0.25 * least(greatest(least(floor(sqrt(greatest(c."XP", 0)::float8 / 100.0)), 20) / 20.0, 0.0), 1.0)
      + 0.20 * least(greatest(ln(1 + c."Fans"::float8) / ln(10.0) / 6.0, 0.0), 1.0)
      + 0.15 * least(greatest(c."Reputation"::float8 / 100.0, 0.0), 1.0)
      + 0.10 * least(greatest(1.0 - (
          coalesce((
            SELECT e."Division" FROM "Entries" e
            JOIN "Seasons" s ON s."_id" = e."SeasonId"
            WHERE e."ClubId" = c."_id" AND e."Division" IS NOT NULL
            ORDER BY (s."Status" = 'running') DESC, s."EditionNumber" DESC NULLS LAST
            LIMIT 1
          ), 14) - 1) / 14.0, 0.0), 1.0)
      )
    )::numeric, 2)::real,
  "ProminenceUpdatedAt" = now();

-- ---------------------------------------------------------------------------
-- 7. PlaceStats projection (clubs per district) + trigger on Clubs.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "PlaceStats" (
  "PlaceId" uuid PRIMARY KEY REFERENCES "Places"("_id"),
  "Clubs" integer NOT NULL DEFAULT 0,
  "UpdatedAt" timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "PlaceStats_Clubs_idx" ON "PlaceStats" ("Clubs");

INSERT INTO "PlaceStats" ("PlaceId", "Clubs", "UpdatedAt")
SELECT d."_id", count(c."_id")::int, now()
FROM "Places" d
LEFT JOIN "Clubs" c ON c."DistrictId" = d."_id"
WHERE d."Type" = 'district'
GROUP BY d."_id"
ON CONFLICT ("PlaceId") DO UPDATE SET "Clubs" = EXCLUDED."Clubs", "UpdatedAt" = now();

CREATE OR REPLACE FUNCTION "sync_place_stats"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."DistrictId" IS NOT NULL THEN
      INSERT INTO "PlaceStats" ("PlaceId", "Clubs", "UpdatedAt")
      VALUES (NEW."DistrictId", 1, now())
      ON CONFLICT ("PlaceId") DO UPDATE
        SET "Clubs" = "PlaceStats"."Clubs" + 1, "UpdatedAt" = now();
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD."DistrictId" IS NOT NULL THEN
      UPDATE "PlaceStats" SET "Clubs" = GREATEST("Clubs" - 1, 0), "UpdatedAt" = now()
      WHERE "PlaceId" = OLD."DistrictId";
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW."DistrictId" IS DISTINCT FROM OLD."DistrictId" THEN
    IF OLD."DistrictId" IS NOT NULL THEN
      UPDATE "PlaceStats" SET "Clubs" = GREATEST("Clubs" - 1, 0), "UpdatedAt" = now()
      WHERE "PlaceId" = OLD."DistrictId";
    END IF;
    IF NEW."DistrictId" IS NOT NULL THEN
      INSERT INTO "PlaceStats" ("PlaceId", "Clubs", "UpdatedAt")
      VALUES (NEW."DistrictId", 1, now())
      ON CONFLICT ("PlaceId") DO UPDATE
        SET "Clubs" = "PlaceStats"."Clubs" + 1, "UpdatedAt" = now();
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Clubs_place_stats" ON "Clubs";
CREATE TRIGGER "Clubs_place_stats"
AFTER INSERT OR DELETE OR UPDATE OF "DistrictId" ON "Clubs"
FOR EACH ROW EXECUTE FUNCTION "sync_place_stats"();

-- ---------------------------------------------------------------------------
-- 8. TileRevisions cache-invalidation counter (WORLD-HIERARCHY-SPEC §7.5).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "TileRevisions" (
  "z" integer NOT NULL,
  "x" integer NOT NULL,
  "y" integer NOT NULL,
  "rev" bigint NOT NULL DEFAULT 0,
  PRIMARY KEY ("z", "x", "y")
);

-- ---------------------------------------------------------------------------
-- 9. Map geometry index for the tile queries.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Places_map_idx" ON "Places" ("Type", "MapX", "MapY")
  WHERE "MapX" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 10. News scopes (DECISIONS Q7): the legacy `town` scope becomes `district`.
-- ---------------------------------------------------------------------------
UPDATE "NewsItems" SET "ScopeType" = 'district' WHERE "ScopeType" = 'town';
