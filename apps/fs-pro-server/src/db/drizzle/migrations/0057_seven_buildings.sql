-- 0057_seven_buildings.sql
--
-- Launch consolidation: the campus has seven buildings (Go:
-- internal/clubhouse/buildings.go). Each upgrades one primary ClubAssets row;
-- the older assets it absorbed carry the primary's level:
--
--   Stadium          turnstiles      <- stadium_grounds, stands
--   Club Vault       cash_vault      <- fan_vault
--   Training Ground  training_ground <- staff_house, coaching_dept, video_analysis
--   Youth Academy    youth_academy   <- scouting, academy, elite_academy, squad_camp
--
-- 1. Nobody loses progress: a primary takes the highest level in its group.
-- 2. Absorbed assets copy the primary (rows inserted where missing), and any
--    upgrade running on an absorbed asset is dropped - it can no longer be
--    started, and its building now carries the level.
-- Idempotent.

WITH pairs(prim, linked) AS (VALUES
  ('turnstiles','stadium_grounds'), ('turnstiles','stands'),
  ('cash_vault','fan_vault'),
  ('training_ground','staff_house'), ('training_ground','coaching_dept'), ('training_ground','video_analysis'),
  ('youth_academy','scouting'), ('youth_academy','academy'), ('youth_academy','elite_academy'), ('youth_academy','squad_camp')
), best AS (
  SELECT a."ClubId", p.prim, max(a."Level") AS lvl
  FROM "ClubAssets" a JOIN pairs p ON a."AssetType" IN (p.prim, p.linked)
  GROUP BY a."ClubId", p.prim
)
INSERT INTO "ClubAssets" ("ClubId", "AssetType", "Level", "updatedAt")
SELECT b."ClubId", b.prim, b.lvl, now() FROM best b
ON CONFLICT ("ClubId", "AssetType") DO UPDATE
SET "Level" = GREATEST("ClubAssets"."Level", EXCLUDED."Level"), "updatedAt" = now()
WHERE "ClubAssets"."Level" < EXCLUDED."Level";

WITH pairs(prim, linked) AS (VALUES
  ('turnstiles','stadium_grounds'), ('turnstiles','stands'),
  ('cash_vault','fan_vault'),
  ('training_ground','staff_house'), ('training_ground','coaching_dept'), ('training_ground','video_analysis'),
  ('youth_academy','scouting'), ('youth_academy','academy'), ('youth_academy','elite_academy'), ('youth_academy','squad_camp')
)
INSERT INTO "ClubAssets" ("ClubId", "AssetType", "Level", "updatedAt")
SELECT a."ClubId", p.linked, a."Level", now()
FROM "ClubAssets" a JOIN pairs p ON p.prim = a."AssetType"
ON CONFLICT ("ClubId", "AssetType") DO UPDATE
SET "Level" = EXCLUDED."Level", "UpgradingTo" = NULL, "StartAt" = NULL, "CompleteAt" = NULL, "updatedAt" = now()
WHERE "ClubAssets"."Level" IS DISTINCT FROM EXCLUDED."Level" OR "ClubAssets"."UpgradingTo" IS NOT NULL;
