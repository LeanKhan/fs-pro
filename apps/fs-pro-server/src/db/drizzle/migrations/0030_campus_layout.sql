-- Every club gets a fixed campus layout (docs/WORLD-VIEW-UI-PLAN.md,
-- "Campus layout variants"): existing clubs by a stable hash of their id,
-- new clubs at creation. Idempotent.
UPDATE "Clubs"
SET "CampusLayout" = (ARRAY['city', 'coastal', 'hillside'])[1 + abs(hashtext("_id"::text)) % 3]
WHERE "CampusLayout" IS NULL OR "CampusLayout" NOT IN ('city', 'coastal', 'hillside');

ALTER TABLE "Clubs" ALTER COLUMN "CampusLayout" SET DEFAULT 'city';
ALTER TABLE "Clubs" ALTER COLUMN "CampusLayout" SET NOT NULL;
