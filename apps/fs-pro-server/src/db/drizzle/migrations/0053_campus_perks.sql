-- 0053_campus_perks.sql
--
-- Wave 5 / P10 follow-up (docs/coc-mapping/04 §7, §10; 05 §8 "Economy"). Purely
-- additive and idempotent so the Node server keeps running against the same
-- schema during the strangler cutover (05 §8 migration rules).
--
-- 1. Clubs.Perks: the "quick consumable counters" jsonb map (04 §10). Shape:
--    { "<perkKey>": <remaining>, ... }. It is written ONLY through
--    campus.usePerk (a transactional, ledgered redemption) - never a bare
--    UPDATE. A fresh club starts with '{}' (no grant path here; perks are
--    awarded by Season/Directive/Festival paths, 04 §7).
--
-- 2. PerkConsumptions: the once-only guard that makes a redemption idempotent
--    per perk instance (04 §10). The caller passes an instanceId; the UNIQUE
--    ("ClubId","InstanceId") key makes a retried request a no-op. It is written
--    in the same transaction as the effect, so a rolled-back redemption can be
--    retried.
--
-- New TransferLedger Type value written by the consume path: 'perk_use' (the
-- column is free-text, so no DDL is required; recorded here for the schema of
-- record, 04 §10).
--
-- Obstacle backfill for clubs founded after 0045 is a lazy, idempotent seed in
-- internal/campus (no DDL): a club with no CampusObstacles rows at all gets the
-- three Derelict Grounds on its first campus read, and a club that cleared all
-- of them (rows kept, ClearedAt set) is never re-seeded.

ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "Perks" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "PerkConsumptions" (
  "_id"        uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "InstanceId" text NOT NULL,
  "ClubId"     uuid NOT NULL REFERENCES "Clubs"("_id"),
  "Perk"       text NOT NULL,
  "createdAt"  timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"  timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "perk_consumptions_instance_uniq" UNIQUE ("ClubId", "InstanceId")
);

-- The read path: a club's consumption history, newest first.
CREATE INDEX IF NOT EXISTS "perk_consumptions_club_idx"
  ON "PerkConsumptions" ("ClubId", "createdAt" DESC);
