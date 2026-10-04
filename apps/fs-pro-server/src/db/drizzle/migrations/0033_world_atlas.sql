-- The world atlas (packages/api-contract world-geo.ts): towns are Places
-- under a country, places have a spot on the map, and players can found
-- countries, towns and clubs. Idempotent.

ALTER TABLE "Places" ADD COLUMN IF NOT EXISTS "ParentId" uuid REFERENCES "Places"("_id");
ALTER TABLE "Places" ADD COLUMN IF NOT EXISTS "FoundedBy" uuid REFERENCES "Users"("_id");
ALTER TABLE "Places" ADD COLUMN IF NOT EXISTS "MapX" real;
ALTER TABLE "Places" ADD COLUMN IF NOT EXISTS "MapY" real;
ALTER TABLE "Places" ADD COLUMN IF NOT EXISTS "Colors" jsonb;
ALTER TABLE "Places" ADD COLUMN IF NOT EXISTS "Terrain" text;
ALTER TABLE "Places" ADD COLUMN IF NOT EXISTS "Motto" text;
CREATE INDEX IF NOT EXISTS "Places_ParentId_idx" ON "Places" ("ParentId");
-- Town names are unique within their country; country names are unique.
CREATE UNIQUE INDEX IF NOT EXISTS "Places_town_name_unique" ON "Places" ("ParentId", lower("Name")) WHERE "ParentId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Places_country_name_unique" ON "Places" (lower("Name")) WHERE "Type" = 'country';

ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "TownId" uuid REFERENCES "Places"("_id");
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "Crest" jsonb;
CREATE INDEX IF NOT EXISTS "Clubs_TownId_idx" ON "Clubs" ("TownId");
CREATE UNIQUE INDEX IF NOT EXISTS "Clubs_name_ci_unique" ON "Clubs" (lower("Name"));

-- 0030 again (its backfill was lost from the dev DB by a later restore): every
-- club has a campus layout. The atlas backfill then aligns it with the town.
UPDATE "Clubs"
SET "CampusLayout" = (ARRAY['city', 'coastal', 'hillside'])[1 + abs(hashtext("_id"::text)) % 3]
WHERE "CampusLayout" IS NULL OR "CampusLayout" NOT IN ('city', 'coastal', 'hillside');
ALTER TABLE "Clubs" ALTER COLUMN "CampusLayout" SET DEFAULT 'city';
ALTER TABLE "Clubs" ALTER COLUMN "CampusLayout" SET NOT NULL;
