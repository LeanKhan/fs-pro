-- 0052_preseason.sql
--
-- Wave 4 / P9 (docs/coc-mapping/02 §J, 04 §8, 05 §8 "Live-ops"; 06 P9). Additive,
-- idempotent, Node-compatible. The Pre-Season Tour onboarding rail: one progress
-- row per (club, stage) recording the best 0-3★ result, the attempt count and the
-- once-only claim guard.
--
-- Guaranteed income is granted by preseason.claim, which credits the club and
-- writes one TransferLedger row per non-zero currency with Type
-- 'preseason_reward' (the TransferLedger.Type column is free-text, so no DDL is
-- required; the value is recorded here for the schema of record, 04 §10).
--
-- The idempotency kill: UNIQUE ("ClubId","Stage") plus the ClaimedAt flag, read
-- FOR UPDATE in one transaction, so a double claim (or a racing pair) can never
-- pay twice.
--
-- All timers are absolute UTC timestamps (ClearedAt/ClaimedAt), never durations
-- (04 §12).

CREATE TABLE IF NOT EXISTS "PreseasonProgress" (
  "_id"       uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ClubId"    uuid NOT NULL REFERENCES "Clubs"("_id"),
  "Stage"     integer NOT NULL,
  "BestStars" integer NOT NULL DEFAULT 0,
  "Attempts"  integer NOT NULL DEFAULT 0,
  "ClearedAt" timestamp(3),
  "ClaimedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "preseason_progress_club_stage_uniq" UNIQUE ("ClubId", "Stage")
);

-- The rail's read path: a club's whole progress table in one scan.
CREATE INDEX IF NOT EXISTS "preseason_progress_club_idx"
  ON "PreseasonProgress" ("ClubId");
