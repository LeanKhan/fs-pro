ALTER TABLE "Competitions" ADD COLUMN IF NOT EXISTS "Tier" integer;
ALTER TABLE "Competitions" ADD COLUMN IF NOT EXISTS "Pod" integer;
-- Existing leagues (Division 1 = top flight) become single-pod tiers.
UPDATE "Competitions" SET "Tier" = "Division", "Pod" = 0
  WHERE "League" = true AND "Division" >= 1 AND "Tier" IS NULL;
