-- World pyramid (docs/WORLD-PYRAMID-SPEC.md): regions, placement settings,
-- the hourly clock and week template, pyramid pools, invites, caretakers and
-- local news. Idempotent. Regions are backfilled and the first pyramid
-- editions drawn by scripts/migration/start-world-pyramid.ts, which needs
-- application code.

-- Places: regions sit between countries and towns.
ALTER TABLE "Places" ADD COLUMN IF NOT EXISTS "RegionId" uuid REFERENCES "Places"("_id");
CREATE INDEX IF NOT EXISTS "Places_RegionId_idx" ON "Places" ("RegionId");
CREATE INDEX IF NOT EXISTS "Places_Type_idx" ON "Places" ("Type");

-- Clubs: activity, caretaker, release, PLAY shield.
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "LastActiveAt" timestamp(3);
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "Caretaker" boolean NOT NULL DEFAULT false;
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "ReleasedAt" timestamp(3);
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "ShieldUntil" timestamp(3);
CREATE INDEX IF NOT EXISTS "Clubs_Rating_idx" ON "Clubs" ("Rating");
CREATE INDEX IF NOT EXISTS "Clubs_AddressCountryId_idx" ON "Clubs" ("AddressCountryId");
-- Everyone counts as active from the moment this runs.
UPDATE "Clubs" SET "LastActiveAt" = now() WHERE "UserId" IS NOT NULL AND "LastActiveAt" IS NULL;

-- Calendar: hourly clock, week template, kickoff hours, placement sizes.
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "CurrentHour" integer NOT NULL DEFAULT 0;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "AiTickLeaseUntil" timestamp(3);
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "DayLengthMinutes" integer NOT NULL DEFAULT 1440;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "WeekTemplate" jsonb NOT NULL DEFAULT '["L","C","L","L","C","L","L"]'::jsonb;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "KickoffHours" jsonb NOT NULL DEFAULT '[12,13,14,15,16,17,18,19,20,21,22]'::jsonb;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "CupKickoffHour" integer NOT NULL DEFAULT 20;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "TownSize" integer NOT NULL DEFAULT 6;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "RegionTowns" integer NOT NULL DEFAULT 8;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "CountryRegions" integer NOT NULL DEFAULT 6;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "CaretakerAfterDays" integer NOT NULL DEFAULT 14;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "ReleaseAfterSeasons" integer NOT NULL DEFAULT 2;
ALTER TABLE "Calendars" ALTER COLUMN "YearLengthDays" SET DEFAULT 28;
ALTER TABLE "Calendars" ALTER COLUMN "TransferWindows" SET DEFAULT '[{"fromDay":1,"toDay":7},{"fromDay":15,"toDay":18}]'::jsonb;
ALTER TABLE "Calendars" DROP COLUMN IF EXISTS "MatchdaySlotMinutes";
ALTER TABLE "Calendars" DROP COLUMN IF EXISTS "OffDaySlotMinutes";

-- Entries and fixtures: divisions, pool slots, kickoff hours.
ALTER TABLE "Entries" ADD COLUMN IF NOT EXISTS "Division" integer;
ALTER TABLE "Entries" ADD COLUMN IF NOT EXISTS "PoolSlot" integer;
ALTER TABLE "Entries" ADD COLUMN IF NOT EXISTS "Movement" integer;
ALTER TABLE "Fixtures" ADD COLUMN IF NOT EXISTS "KickoffHour" integer;
CREATE INDEX IF NOT EXISTS "fixtures_day_kickoff_idx" ON "Fixtures" ("ScheduledDay", "KickoffHour");
-- A club's fixtures (scheduler, PLAY cooldown, histories) by team.
CREATE INDEX IF NOT EXISTS "fixtures_home_day_idx" ON "Fixtures" ("HomeTeamId", "ScheduledDay");
CREATE INDEX IF NOT EXISTS "fixtures_away_day_idx" ON "Fixtures" ("AwayTeamId", "ScheduledDay");

CREATE TABLE IF NOT EXISTS "Pools" (
  "_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "SeasonId" uuid NOT NULL REFERENCES "Seasons"("_id"),
  "Division" integer NOT NULL,
  "Number" integer NOT NULL,
  "Name" text NOT NULL,
  "RegionId" uuid REFERENCES "Places"("_id"),
  "KickoffHour" integer NOT NULL,
  "Size" integer NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "pools_season_division_idx" ON "Pools" ("SeasonId", "Division");

CREATE TABLE IF NOT EXISTS "TownInvites" (
  "_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "Token" text NOT NULL UNIQUE,
  "TownId" uuid NOT NULL REFERENCES "Places"("_id"),
  "ByClubId" uuid NOT NULL REFERENCES "Clubs"("_id"),
  "ExpiresAt" timestamp(3) NOT NULL,
  "MaxUses" integer NOT NULL DEFAULT 5,
  "Uses" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "town_invites_club_idx" ON "TownInvites" ("ByClubId");

CREATE TABLE IF NOT EXISTS "NewsItems" (
  "_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ScopeType" text NOT NULL,
  "ScopeId" uuid,
  "StoryId" uuid NOT NULL,
  "Kind" text NOT NULL,
  "Importance" integer NOT NULL,
  "Title" text NOT NULL,
  "Body" text NOT NULL DEFAULT '',
  "ClubIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "FixtureId" uuid REFERENCES "Fixtures"("_id"),
  "Day" integer NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "news_items_story_scope_uq" UNIQUE ("StoryId", "ScopeType")
);
CREATE INDEX IF NOT EXISTS "news_items_scope_idx" ON "NewsItems" ("ScopeType", "ScopeId", "createdAt");
