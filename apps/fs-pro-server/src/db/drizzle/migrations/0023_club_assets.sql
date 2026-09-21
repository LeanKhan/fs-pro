CREATE TABLE IF NOT EXISTS "ClubAssets" (
  "_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ClubId" uuid NOT NULL REFERENCES "Clubs"("_id"),
  "AssetType" text NOT NULL,
  "Level" integer NOT NULL DEFAULT 0,
  "UpgradingTo" integer,
  "StartDay" integer,
  "CompleteDay" integer,
  "createdAt" timestamp(3) DEFAULT now() NOT NULL,
  "updatedAt" timestamp(3) NOT NULL,
  CONSTRAINT "club_assets_club_type_uniq" UNIQUE ("ClubId", "AssetType")
);
CREATE INDEX IF NOT EXISTS "club_assets_upgrading_idx" ON "ClubAssets" ("CompleteDay");
