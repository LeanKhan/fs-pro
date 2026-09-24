ALTER TABLE "ClubAssets" ADD COLUMN IF NOT EXISTS "StartAt" timestamp(3);
ALTER TABLE "ClubAssets" ADD COLUMN IF NOT EXISTS "CompleteAt" timestamp(3);
CREATE INDEX IF NOT EXISTS "club_assets_complete_at_idx" ON "ClubAssets" ("CompleteAt");
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "XP" integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS "ClubChallenges" (
  "_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ClubId" uuid NOT NULL REFERENCES "Clubs"("_id"),
  "Type" text NOT NULL,
  "Title" text NOT NULL,
  "TargetWins" integer NOT NULL,
  "Wins" integer NOT NULL DEFAULT 0,
  "MatchesPlayed" integer NOT NULL DEFAULT 0,
  "Status" text NOT NULL DEFAULT 'active',
  "ExpiresAt" timestamp(3) NOT NULL,
  "RewardCash" real NOT NULL,
  "RewardXP" integer NOT NULL,
  "ResolvedAt" timestamp(3),
  "createdAt" timestamp(3) DEFAULT now() NOT NULL,
  "updatedAt" timestamp(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "club_challenges_club_status_idx" ON "ClubChallenges" ("ClubId", "Status");
