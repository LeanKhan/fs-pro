-- 0046_economy_liveops.sql
--
-- Wave 1 / P0 (docs/coc-mapping/05 §8 "Economy" + "Live-ops"; 04 §5.2, §6, §10).
-- Additive, idempotent, Node-compatible. Board Vault = protected bonus loot
-- (Treasury analog); Season Bank accrues a slice of income for the month;
-- Board Perks are the Magic-Item inventory; Season Objectives/Tiers/Claims are
-- the monthly pass; Honours + LegacyProgress are the long-horizon (and the
-- 6th-Groundskeeper) rails.
--
-- New TransferLedger Type values written by this build (free-text column, so no
-- DDL is required; recorded here for the schema of record, 04 §10):
--   collector_income, raid_loot, form_bonus, season_bank, perk_grant,
--   trait_alloy, obstacle, groundskeeper, facility.

-- ---------------------------------------------------------------------------
-- Board Vault: protected bonus loot, ~97% unstealable (04 §5.2). One row/club.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "BoardVault" (
  "ClubId"    uuid PRIMARY KEY REFERENCES "Clubs"("_id"),
  "Balance"   real NOT NULL DEFAULT 0,
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Season Bank: a fraction of raid/Derby loot accrued over the real-time month,
-- claimed at season end (04 §6). One row per (club, season key).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "SeasonBank" (
  "_id"       uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ClubId"    uuid NOT NULL REFERENCES "Clubs"("_id"),
  "SeasonKey" text NOT NULL,
  "Accrued"   real NOT NULL DEFAULT 0,
  "Claimed"   real NOT NULL DEFAULT 0,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "season_bank_club_season_uniq" UNIQUE ("ClubId", "SeasonKey")
);

-- ---------------------------------------------------------------------------
-- Board Perks: the Magic-Item inventory. Never stealable (04 §7).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "BoardPerks" (
  "_id"       uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ClubId"    uuid NOT NULL REFERENCES "Clubs"("_id"),
  "Perk"      text NOT NULL,
  "Count"     integer NOT NULL DEFAULT 0,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "board_perks_club_perk_uniq" UNIQUE ("ClubId", "Perk")
);

-- ---------------------------------------------------------------------------
-- Season Objectives / Tiers / Claims (04 §6). Objective points -> tier; Silver
-- is free, Gold requires the pass. Claims are once-per-(club, season, track, tier)
-- (the idempotency guard).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "SeasonObjectives" (
  "_id"       uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "SeasonKey" text NOT NULL,
  "Code"      text NOT NULL,
  "Title"     text NOT NULL,
  "Points"    integer NOT NULL DEFAULT 0,
  "Goal"      integer NOT NULL DEFAULT 1,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "season_objectives_season_code_uniq" UNIQUE ("SeasonKey", "Code")
);

CREATE TABLE IF NOT EXISTS "SeasonTiers" (
  "_id"       uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "SeasonKey" text NOT NULL,
  "Tier"      integer NOT NULL,
  "Points"    integer NOT NULL,
  "Rewards"   jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "season_tiers_season_tier_uniq" UNIQUE ("SeasonKey", "Tier")
);

CREATE TABLE IF NOT EXISTS "SeasonClaims" (
  "_id"       uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ClubId"    uuid NOT NULL REFERENCES "Clubs"("_id"),
  "SeasonKey" text NOT NULL,
  "Track"     text NOT NULL,
  "Tier"      integer NOT NULL,
  "Points"    integer NOT NULL DEFAULT 0,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "season_claims_club_season_uniq" UNIQUE ("ClubId", "SeasonKey", "Track", "Tier")
);

-- ---------------------------------------------------------------------------
-- Club Honours + Club Legacy (02 §I, §K; 04 §2). Honours award Sponsor
-- Credits / Regalia; the Legacy chain grants the 6th Groundskeeper.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Honours" (
  "_id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ClubId"      uuid NOT NULL REFERENCES "Clubs"("_id"),
  "Code"        text NOT NULL,
  "Progress"    integer NOT NULL DEFAULT 0,
  "CompletedAt" timestamp(3),
  "createdAt"   timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"   timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "honours_club_code_uniq" UNIQUE ("ClubId", "Code")
);

CREATE TABLE IF NOT EXISTS "LegacyProgress" (
  "_id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ClubId"      uuid NOT NULL REFERENCES "Clubs"("_id"),
  "Step"        text NOT NULL,
  "Progress"    integer NOT NULL DEFAULT 0,
  "CompletedAt" timestamp(3),
  "createdAt"   timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"   timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "legacy_progress_club_step_uniq" UNIQUE ("ClubId", "Step")
);
