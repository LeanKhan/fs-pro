-- 0042_owner_program.sql
--
-- Phase 2, Batch 2, Agent 2B. The owner program (docs/perfect/phase-2/
-- OWNER-PROGRAM-SPEC.md §8-§9; FOR-AGENTS L1/L4/L5/L8):
--
--   * OwnerProgram  - the server-side, per-club onboarding state machine
--                     (L8). Step: not_started | manager | players |
--                     facilities | level1 | done. StepStars holds the 1-3 star
--                     decision quality per completed step; ProgramXp is the
--                     capped sum used by the level1 star predicate.
--   * Managers      - real-hire attributes (L4), a per-Year wage, a one-off
--                     signing fee and a contract.
--   * Players       - FreeAgentSince, the TTL anchor for the bounded market.
--   * WorldSeed     - the idempotency ledger for the L5 world seed.
--
-- Two columns beyond the spec's §9.1 sketch are added because the step
-- predicates need state the spec has nowhere else to persist:
--   * OwnerProgram.StartingBalance - the V1M-V5M draw at founding, which the
--     manager step measures the fee against (contract §1.2).
--   * OwnerProgram.Scout           - the managers browsed/interviewed and the
--     players scouted (contract §1.2 `facts.scout`).
-- Documented in the B2-2B report.
--
-- Every statement is idempotent-guarded (IF NOT EXISTS / WHERE ... IS NULL),
-- like 0038_world_districts.sql. Data statements run once, keyed by the
-- migration ledger (apply-sql-migrations.ts).

-- ---------------------------------------------------------------------------
-- Owner program state (L8).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "OwnerProgram" (
  "ClubId"          uuid PRIMARY KEY REFERENCES "Clubs"("_id"),
  "Step"            text NOT NULL DEFAULT 'manager',
  "StepStars"       jsonb NOT NULL DEFAULT '{}'::jsonb,
  "ProgramXp"       integer NOT NULL DEFAULT 0,
  "StartingBalance" real NOT NULL DEFAULT 0,
  "Scout"           jsonb NOT NULL DEFAULT '{"managerIdsBrowsed":[],"interviewedManagerIds":[],"scoutedPlayerIds":[]}'::jsonb,
  "Chapter"         text,
  "ChapterData"     jsonb,
  "DismissedTips"   jsonb NOT NULL DEFAULT '[]'::jsonb,
  "StartedAt"       timestamp(3) NOT NULL DEFAULT now(),
  "CompletedAt"     timestamp(3),
  "updatedAt"       timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "OwnerProgram_step_idx" ON "OwnerProgram" ("Step");

-- ---------------------------------------------------------------------------
-- Manager attributes, wage, signing fee and contract (L4). All nullable so the
-- backfill can fill existing rows; ContractYears defaults to 0 ("no live
-- contract") so an existing unsigned manager can be signed from the market.
-- ---------------------------------------------------------------------------

ALTER TABLE "Managers" ADD COLUMN IF NOT EXISTS "Tactics" integer;
ALTER TABLE "Managers" ADD COLUMN IF NOT EXISTS "Motivation" integer;
ALTER TABLE "Managers" ADD COLUMN IF NOT EXISTS "Development" integer;
ALTER TABLE "Managers" ADD COLUMN IF NOT EXISTS "Discipline" integer;
ALTER TABLE "Managers" ADD COLUMN IF NOT EXISTS "Overall" integer;
ALTER TABLE "Managers" ADD COLUMN IF NOT EXISTS "Wage" real;
ALTER TABLE "Managers" ADD COLUMN IF NOT EXISTS "SigningFee" real;
ALTER TABLE "Managers" ADD COLUMN IF NOT EXISTS "ContractYears" integer NOT NULL DEFAULT 0;
ALTER TABLE "Managers" ADD COLUMN IF NOT EXISTS "ContractUntilYear" integer;

-- ---------------------------------------------------------------------------
-- Free-agent market metadata (L5). FreeAgentSince is the game-day the player
-- entered the pool; 2C's expiry marks unsigned players retired after the TTL.
-- ---------------------------------------------------------------------------

ALTER TABLE "Players" ADD COLUMN IF NOT EXISTS "FreeAgentSince" integer;
CREATE INDEX IF NOT EXISTS "Players_free_agent_idx"
  ON "Players" ("isSigned", "isRetired") WHERE "isSigned" = false;

-- ---------------------------------------------------------------------------
-- World-seed idempotency ledger (L5, 2C writes it; the table is part of this
-- migration so the schema ships whole).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "WorldSeed" (
  "Key"       text PRIMARY KEY,
  "Version"   integer NOT NULL DEFAULT 1,
  "AppliedAt" timestamp(3) NOT NULL DEFAULT now()
);

-- ===========================================================================
-- Backfill (L3): existing clubs keep everything; mark their program complete.
-- ===========================================================================

INSERT INTO "OwnerProgram" ("ClubId", "Step", "StartingBalance", "StartedAt", "CompletedAt", "updatedAt")
SELECT c."_id", 'done', coalesce(c."Budget", 0), coalesce(c."createdAt", now()), now(), now()
FROM "Clubs" c
ON CONFLICT ("ClubId") DO NOTHING;

-- Existing managers: deterministic attributes from the stable Key, so the
-- values never change between runs. hashtext(...) & 45 yields 0..44, mapped to
-- 40..84. The bounds are the manager model's 40-90.
UPDATE "Managers" m SET
  "Tactics"     = coalesce(m."Tactics",     (hashtext(m."Key" || 't') & 45) + 40),
  "Motivation"  = coalesce(m."Motivation",  (hashtext(m."Key" || 'm') & 45) + 40),
  "Development" = coalesce(m."Development", (hashtext(m."Key" || 'd') & 45) + 40),
  "Discipline"  = coalesce(m."Discipline",  (hashtext(m."Key" || 'x') & 45) + 40),
  "updatedAt"   = now()
WHERE m."Tactics" IS NULL;

UPDATE "Managers" m SET
  "Overall" = round(0.40 * m."Tactics" + 0.20 * m."Motivation" + 0.25 * m."Development" + 0.15 * m."Discipline")::int,
  "updatedAt" = now()
WHERE m."Overall" IS NULL;

-- Fee/wage from the overall, per OWNER-PROGRAM-SPEC §5.3. Existing managers
-- keep their club; this only gives them marketable numbers.
UPDATE "Managers" m SET
  "SigningFee" = CASE
    WHEN m."Overall" >= 75 THEN 2000000
    WHEN m."Overall" >= 70 THEN 1100000
    WHEN m."Overall" >= 65 THEN 650000
    WHEN m."Overall" >= 60 THEN 360000
    WHEN m."Overall" >= 55 THEN 180000
    WHEN m."Overall" >= 50 THEN 90000
    ELSE 40000 END,
  "Wage" = CASE
    WHEN m."Overall" >= 75 THEN 100000
    WHEN m."Overall" >= 70 THEN 55000
    WHEN m."Overall" >= 65 THEN 32500
    WHEN m."Overall" >= 60 THEN 18000
    WHEN m."Overall" >= 55 THEN 9000
    WHEN m."Overall" >= 50 THEN 4500
    ELSE 2000 END,
  "updatedAt" = now()
WHERE m."SigningFee" IS NULL;

-- An employed manager gets a two-year contract from the current year (so the
-- manager step's `contractYears > 0` holds if their club ever re-enters the
-- program); unsigned managers stay at the 0-column default for the market.
UPDATE "Managers" m SET
  "ContractYears" = 2,
  "ContractUntilYear" = coalesce((SELECT c."CurrentYear" FROM "Calendars" c LIMIT 1), 1) + 2,
  "updatedAt" = now()
WHERE m."ClubId" IS NOT NULL AND m."ContractUntilYear" IS NULL;

-- Existing free agents get a TTL anchor at the current game day (2C's expiry
-- rule then bounds the pool). Club players and retirees are left null.
UPDATE "Players" p SET "FreeAgentSince" = coalesce((SELECT c."CurrentDay" FROM "Calendars" c LIMIT 1), 0)
WHERE p."isSigned" = false AND p."isRetired" = false AND p."FreeAgentSince" IS NULL;
