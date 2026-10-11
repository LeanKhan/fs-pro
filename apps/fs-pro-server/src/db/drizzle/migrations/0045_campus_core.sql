-- 0045_campus_core.sql
--
-- Wave 1 / P0+P1 (docs/coc-mapping/05 §8, "Campus" + "Grid" + "Ladder" columns;
-- 04 §1, §2, §3, §10). The campus is the CoC "village": a hard-gate Clubhouse
-- tier, the crossed two-currency collectors and vaults, the Groundskeeper
-- build-slot bottleneck, and the Derelict Grounds obstacles. This migration is
-- purely additive and idempotent so the Node server keeps running against the
-- same schema during the strangler cutover (05 §8 migration rules).
--
-- Timers introduced here are ABSOLUTE UTC timestamps (GuardUntil) or columns on
-- ClubAssets (StartAt/CompleteAt, already migrated in 0025). No durations or
-- game-days are stored for the campus loop (04 §12).

-- ---------------------------------------------------------------------------
-- Clubs: Clubhouse tier, the economy currencies, the pitch-grid layout document
-- and the collector accumulator.
-- ---------------------------------------------------------------------------

-- The single hard gate (02 §A): caps every facility level, squad slots and
-- league access. New clubs start at tier 1.
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "ClubhouseTier" integer NOT NULL DEFAULT 1;

-- The Pitch Grid layouts (home/match/derby) - the shared grid document
-- (@repo/api-contract/src/layout.ts). NULL = no saved layouts yet; the grid
-- repository reads NULL/absent as an empty document. Required by the P3 grid
-- work (docs/coc-mapping/05 §8 "Grid").
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "Layouts" jsonb;

-- Collector accrual is lazy (04 §3.1): lastCollectedAt per collector is stored
-- here rather than written every tick (the Finances.shopCollectedAt pattern,
-- 05 §7). Shape: { "turnstiles": "<iso>", "club_shop": "<iso>" }.
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "CollectorState" jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Per-currency vault levels (04 §3.3); capacities are derived from level +
-- Clubhouse tier. Shape: { "cash": 1, "fans": 1, "scout": 0 }.
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "Vaults" jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Warm-up Guard (02 §E): a real-time protection window, absolute UTC. Shield
-- already exists (0035) and stays authoritative for the Rest Window.
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "GuardUntil" timestamp(3);

-- Standing Points - the async ladder rating (04 §4.1), kept separate from the
-- structured-competition Elo (02 §H ruling).
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "StandingPoints" integer NOT NULL DEFAULT 0;

-- Elite + premium currencies (04 §1): Scout Tokens and Sponsor Credits.
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "ScoutTokens" integer NOT NULL DEFAULT 0;
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "SponsorCredits" integer NOT NULL DEFAULT 0;

-- Trait Alloys (04 §1, "Ores"): the elite sub-resource that upgrades traits.
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "TraitAlloys" jsonb NOT NULL
  DEFAULT '{"shiny":0,"glowy":0,"starry":0}'::jsonb;

-- Hot-path indexes (05 §7): ladder ordering, matchmaking by tier, builder sweep.
CREATE INDEX IF NOT EXISTS "Clubs_standing_points_idx" ON "Clubs" ("StandingPoints");
CREATE INDEX IF NOT EXISTS "Clubs_clubhouse_tier_idx" ON "Clubs" ("ClubhouseTier");

-- Backfill ClubhouseTier from the highest existing facility level so an already
-- developed club is not reset to tier 1 (05 §8 rule 2). A club with no assets
-- stays at the tier-1 default.
UPDATE "Clubs" c SET "ClubhouseTier" = GREATEST(1, sub.top)
FROM (
  SELECT "ClubId", MAX("Level") AS top FROM "ClubAssets" GROUP BY "ClubId"
) sub
WHERE sub."ClubId" = c."_id" AND c."ClubhouseTier" < sub.top;

-- ---------------------------------------------------------------------------
-- Groundskeepers: the scarce simultaneous-build slots (02 §A, 04 §2).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ClubGroundskeepers" (
  "ClubId"    uuid PRIMARY KEY REFERENCES "Clubs"("_id"),
  "Count"     integer NOT NULL DEFAULT 1,
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);

-- Existing clubs start with the milestone Groundskeepers their tier has earned.
INSERT INTO "ClubGroundskeepers" ("ClubId", "Count", "updatedAt")
SELECT c."_id", LEAST(3, GREATEST(1, LEAST(c."ClubhouseTier", 3))), now()
FROM "Clubs" c
ON CONFLICT ("ClubId") DO NOTHING;

-- ---------------------------------------------------------------------------
-- Derelict Grounds: clearable obstacles that free campus space and pay a bonus
-- (02 §A). Absolute UTC; a cleared row is kept for history and filtered on read.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "CampusObstacles" (
  "_id"       uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ClubId"    uuid NOT NULL REFERENCES "Clubs"("_id"),
  "Kind"      text NOT NULL,
  "X"         integer NOT NULL,
  "Z"         integer NOT NULL,
  "Rot"       integer NOT NULL DEFAULT 0,
  "ClearedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "campus_obstacles_club_idx"
  ON "CampusObstacles" ("ClubId") WHERE "ClearedAt" IS NULL;

-- Backfill: three deterministic obstacles for every club that has none, so the
-- clear path has content from day one. Idempotent per club.
INSERT INTO "CampusObstacles" ("ClubId", "Kind", "X", "Z", "Rot")
SELECT c."_id",
       (ARRAY['weeds', 'dirt', 'rubble'])[1 + (abs(hashtext(c."_id"::text || 'k' || g.n)) % 3)],
       -12 + (abs(hashtext(c."_id"::text || 'x' || g.n)) % 20),
       -10 + (abs(hashtext(c."_id"::text || 'z' || g.n)) % 18),
       0
FROM "Clubs" c
CROSS JOIN generate_series(1, 3) AS g(n)
WHERE NOT EXISTS (
  SELECT 1 FROM "CampusObstacles" o WHERE o."ClubId" = c."_id"
);
