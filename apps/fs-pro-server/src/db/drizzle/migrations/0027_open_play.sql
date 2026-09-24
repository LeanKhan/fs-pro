-- Open-play competitions (docs/OPEN-PLAY-COMPETITIONS-SPEC.md), step 2:
-- additive only. Old columns (Standings, Year, League/Cup/Tournament,
-- Division, LeagueId, Week...) stay until the data script has run
-- everywhere; a follow-up migration drops them. New definition/edition
-- columns are nullable here for the same reason and become NOT NULL then.

-- Competitions: the admin's definition.
ALTER TABLE "Competitions" ADD COLUMN IF NOT EXISTS "Description" text;
ALTER TABLE "Competitions" ADD COLUMN IF NOT EXISTS "Prestige" integer NOT NULL DEFAULT 2;
ALTER TABLE "Competitions" ADD COLUMN IF NOT EXISTS "Entry" jsonb;
ALTER TABLE "Competitions" ADD COLUMN IF NOT EXISTS "Stages" jsonb;
ALTER TABLE "Competitions" ADD COLUMN IF NOT EXISTS "WinCondition" jsonb;
ALTER TABLE "Competitions" ADD COLUMN IF NOT EXISTS "Rewards" jsonb;
ALTER TABLE "Competitions" ADD COLUMN IF NOT EXISTS "Outcomes" jsonb;
ALTER TABLE "Competitions" ADD COLUMN IF NOT EXISTS "Recurrence" jsonb;
ALTER TABLE "Competitions" ADD COLUMN IF NOT EXISTS "Archived" boolean NOT NULL DEFAULT false;

-- Seasons: one edition of a competition.
ALTER TABLE "Seasons" ADD COLUMN IF NOT EXISTS "EditionNumber" integer;
ALTER TABLE "Seasons" ADD COLUMN IF NOT EXISTS "RegistrationOpensDay" integer;
ALTER TABLE "Seasons" ADD COLUMN IF NOT EXISTS "RegistrationClosesDay" integer;
ALTER TABLE "Seasons" ADD COLUMN IF NOT EXISTS "StartDay" integer;
ALTER TABLE "Seasons" ADD COLUMN IF NOT EXISTS "EndDay" integer;
ALTER TABLE "Seasons" ADD COLUMN IF NOT EXISTS "CurrentStage" integer NOT NULL DEFAULT 0;
ALTER TABLE "Seasons" ADD COLUMN IF NOT EXISTS "StageStartedDay" integer;
ALTER TABLE "Seasons" ADD COLUMN IF NOT EXISTS "Definition" jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS "seasons_competition_edition_uq"
  ON "Seasons" ("CompetitionId", "EditionNumber");
CREATE INDEX IF NOT EXISTS "seasons_status_idx" ON "Seasons" ("Status");

-- Entries: a club registered in an edition (replaces CompetitionClubs).
CREATE TABLE IF NOT EXISTS "Entries" (
  "_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "SeasonId" uuid NOT NULL REFERENCES "Seasons"("_id"),
  "ClubId" uuid NOT NULL REFERENCES "Clubs"("_id"),
  "Status" text NOT NULL DEFAULT 'registered',
  "Seed" integer,
  "Group" text,
  "FeePaid" real NOT NULL DEFAULT 0,
  "EliminatedAtStage" integer,
  "createdAt" timestamp(3) DEFAULT now() NOT NULL,
  "updatedAt" timestamp(3) NOT NULL,
  CONSTRAINT "entries_season_club_uq" UNIQUE ("SeasonId", "ClubId")
);
CREATE INDEX IF NOT EXISTS "entries_club_status_idx" ON "Entries" ("ClubId", "Status");

-- Fixtures: challenges and knockout ties.
ALTER TABLE "Fixtures" ADD COLUMN IF NOT EXISTS "CompetitionId" uuid REFERENCES "Competitions"("_id");
ALTER TABLE "Fixtures" ADD COLUMN IF NOT EXISTS "StageIndex" integer;
ALTER TABLE "Fixtures" ADD COLUMN IF NOT EXISTS "Round" integer;
ALTER TABLE "Fixtures" ADD COLUMN IF NOT EXISTS "Leg" integer;
ALTER TABLE "Fixtures" ADD COLUMN IF NOT EXISTS "ChallengeStatus" text;
ALTER TABLE "Fixtures" ADD COLUMN IF NOT EXISTS "ChallengerClubId" uuid REFERENCES "Clubs"("_id");
ALTER TABLE "Fixtures" ADD COLUMN IF NOT EXISTS "ProposedAt" timestamp(3);
ALTER TABLE "Fixtures" ADD COLUMN IF NOT EXISTS "RespondBy" integer;
ALTER TABLE "Fixtures" ADD COLUMN IF NOT EXISTS "PlayBy" integer;
CREATE INDEX IF NOT EXISTS "fixtures_competition_challenge_idx"
  ON "Fixtures" ("CompetitionId", "ChallengeStatus");
CREATE INDEX IF NOT EXISTS "fixtures_season_stage_round_idx"
  ON "Fixtures" ("SeasonId", "StageIndex", "Round");

-- Rankings: one row per (edition, stage, club).
CREATE TABLE IF NOT EXISTS "Rankings" (
  "_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "SeasonId" uuid NOT NULL REFERENCES "Seasons"("_id"),
  "ClubId" uuid NOT NULL REFERENCES "Clubs"("_id"),
  "StageIndex" integer NOT NULL DEFAULT 0,
  "Group" text,
  "Played" integer NOT NULL DEFAULT 0,
  "Wins" integer NOT NULL DEFAULT 0,
  "Draws" integer NOT NULL DEFAULT 0,
  "Losses" integer NOT NULL DEFAULT 0,
  "GF" integer NOT NULL DEFAULT 0,
  "GA" integer NOT NULL DEFAULT 0,
  "GD" integer NOT NULL DEFAULT 0,
  "Points" integer NOT NULL DEFAULT 0,
  "CleanSheets" integer NOT NULL DEFAULT 0,
  "Forfeits" integer NOT NULL DEFAULT 0,
  "UnbeatenRun" integer NOT NULL DEFAULT 0,
  "BestUnbeatenRun" integer NOT NULL DEFAULT 0,
  "EloStart" real NOT NULL DEFAULT 1500,
  "LastPlayedDay" integer,
  "createdAt" timestamp(3) DEFAULT now() NOT NULL,
  "updatedAt" timestamp(3) NOT NULL,
  CONSTRAINT "rankings_season_stage_club_uq" UNIQUE ("SeasonId", "StageIndex", "ClubId")
);

-- RankingResults: idempotency ledger, one row per applied fixture result.
CREATE TABLE IF NOT EXISTS "RankingResults" (
  "FixtureId" uuid PRIMARY KEY REFERENCES "Fixtures"("_id"),
  "SeasonId" uuid NOT NULL REFERENCES "Seasons"("_id"),
  "AppliedAt" timestamp(3) DEFAULT now() NOT NULL
);

-- Clubs: Elo, policies, campus layout. XP already exists (0025).
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "Elo" real NOT NULL DEFAULT 1500;
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "ChallengePolicy" jsonb;
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "EntryPolicy" jsonb;
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "CampusLayout" text;

-- ClubPerformance: the board's yearly performance score.
CREATE TABLE IF NOT EXISTS "ClubPerformance" (
  "_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ClubId" uuid NOT NULL REFERENCES "Clubs"("_id"),
  "Year" integer NOT NULL,
  "Score" real NOT NULL DEFAULT 0,
  "Entries" integer NOT NULL DEFAULT 0,
  "Trophies" integer NOT NULL DEFAULT 0,
  "EloStart" real NOT NULL DEFAULT 1500,
  "EloEnd" real NOT NULL DEFAULT 1500,
  "LevelStart" integer NOT NULL DEFAULT 0,
  "LevelEnd" integer NOT NULL DEFAULT 0,
  "Frozen" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) DEFAULT now() NOT NULL,
  "updatedAt" timestamp(3) NOT NULL,
  CONSTRAINT "club_performance_club_year_uq" UNIQUE ("ClubId", "Year")
);

-- LevelHistory: every Level change and why.
CREATE TABLE IF NOT EXISTS "LevelHistory" (
  "_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ClubId" uuid NOT NULL REFERENCES "Clubs"("_id"),
  "Day" integer NOT NULL,
  "FromLevel" integer NOT NULL,
  "ToLevel" integer NOT NULL,
  "XPBefore" integer NOT NULL,
  "XPAfter" integer NOT NULL,
  "Source" text NOT NULL,
  "SeasonId" uuid REFERENCES "Seasons"("_id"),
  "createdAt" timestamp(3) DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "level_history_club_day_idx" ON "LevelHistory" ("ClubId", "Day");

-- Calendars: world settings.
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "YearLengthDays" integer NOT NULL DEFAULT 360;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "CurrentYear" integer NOT NULL DEFAULT 1;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "YearStartDay" integer NOT NULL DEFAULT 0;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "AutoRollover" boolean NOT NULL DEFAULT true;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "TransferWindows" jsonb NOT NULL
  DEFAULT '[{"fromDay":1,"toDay":30},{"fromDay":180,"toDay":210}]'::jsonb;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "DefaultRules" jsonb;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "LevelThresholds" jsonb;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "XPPerMatch" jsonb;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "LevelTargets" jsonb;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "LevelReview" jsonb;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "MaxConcurrentEntries" integer NOT NULL DEFAULT 3;
