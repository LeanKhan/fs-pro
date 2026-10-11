-- 0056_starter_economy.sql
--
-- Every club starts with a working collector for each currency and its vault
-- at level 1 (CoC's first gold mine + storage). Founding now inserts these
-- (internal/atlas seedStarterClub); this backfills clubs founded before, so
-- their Turnstiles and Club Shop actually produce.
--
-- Idempotent: missing rows are inserted at level 1, idle level-0 rows raised
-- to 1; rows already built (level >= 1) or mid-upgrade are left alone.

INSERT INTO "ClubAssets" ("ClubId", "AssetType", "Level", "updatedAt")
SELECT c."_id", t.asset, 1, now()
FROM "Clubs" c
CROSS JOIN (VALUES ('turnstiles'), ('club_shop'), ('cash_vault'), ('fan_vault')) AS t(asset)
ON CONFLICT ("ClubId", "AssetType") DO NOTHING;

UPDATE "ClubAssets"
SET "Level" = 1, "updatedAt" = now()
WHERE "AssetType" IN ('turnstiles', 'club_shop', 'cash_vault', 'fan_vault')
  AND "Level" = 0 AND "UpgradingTo" IS NULL;

-- The Clubhouse building's level is the club's Clubhouse tier (clubhouse.SyncTier
-- promotes a finished upgrade into Clubs.ClubhouseTier); clubs that never had
-- the row read as level 0 and were offered a pointless "upgrade to Tier 1".
INSERT INTO "ClubAssets" ("ClubId", "AssetType", "Level", "updatedAt")
SELECT c."_id", 'clubhouse', GREATEST(1, COALESCE(c."ClubhouseTier", 1)), now()
FROM "Clubs" c
ON CONFLICT ("ClubId", "AssetType") DO NOTHING;

UPDATE "ClubAssets" a
SET "Level" = GREATEST(1, COALESCE(c."ClubhouseTier", 1)), "updatedAt" = now()
FROM "Clubs" c
WHERE a."ClubId" = c."_id" AND a."AssetType" = 'clubhouse'
  AND a."Level" < GREATEST(1, COALESCE(c."ClubhouseTier", 1)) AND a."UpgradingTo" IS NULL;
