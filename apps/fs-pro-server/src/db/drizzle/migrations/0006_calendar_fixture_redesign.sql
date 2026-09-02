-- Calendar/Season/Fixture/Day redesign - see FUTURE-PLANS.md.
--
-- IMPORTANT: run this ONLY after `reset-calendar-model.ts --apply` has
-- emptied Calendars/Days/Seasons/Fixtures (and their dependents) - several
-- statements below add NOT NULL columns with no default, which only works
-- because those tables are guaranteed empty at this point.

-- Calendars: collapse to a true singleton (one perpetual timeline, not one
-- row per real-world year).
ALTER TABLE "Calendars" DROP CONSTRAINT IF EXISTS "Calendars_mongoId_unique";
ALTER TABLE "Calendars" DROP COLUMN IF EXISTS "mongoId";
ALTER TABLE "Calendars" DROP COLUMN IF EXISTS "Name";
ALTER TABLE "Calendars" DROP COLUMN IF EXISTS "YearString";
ALTER TABLE "Calendars" DROP COLUMN IF EXISTS "YearDigits";
ALTER TABLE "Calendars" DROP COLUMN IF EXISTS "isActive";
ALTER TABLE "Calendars" DROP COLUMN IF EXISTS "isEnded";
ALTER TABLE "Calendars" DROP COLUMN IF EXISTS "allSeasonsCompleted";
ALTER TABLE "Calendars" ADD COLUMN "singleton" boolean NOT NULL DEFAULT true;
ALTER TABLE "Calendars" ADD CONSTRAINT "Calendars_singleton_unique" UNIQUE ("singleton");
ALTER TABLE "Calendars" ALTER COLUMN "CurrentDay" SET NOT NULL;
ALTER TABLE "Calendars" ALTER COLUMN "CurrentDay" SET DEFAULT 0;
ALTER TABLE "Calendars" ADD COLUMN "CurrentDate" timestamp(3) NOT NULL;
--> statement-breakpoint

-- Days: sparse now - a row only exists for a real, non-match calendar
-- event. Matches moved onto Fixtures.ScheduledDay/ScheduledDate below.
ALTER TABLE "Days" DROP CONSTRAINT IF EXISTS "Days_Calendar_Calendars__id_fk";
ALTER TABLE "Days" DROP CONSTRAINT IF EXISTS "Days_mongoId_unique";
ALTER TABLE "Days" DROP COLUMN IF EXISTS "mongoId";
ALTER TABLE "Days" DROP COLUMN IF EXISTS "Matches";
ALTER TABLE "Days" DROP COLUMN IF EXISTS "isFree";
ALTER TABLE "Days" DROP COLUMN IF EXISTS "Day";
ALTER TABLE "Days" DROP COLUMN IF EXISTS "Year";
ALTER TABLE "Days" DROP COLUMN IF EXISTS "Calendar";
ALTER TABLE "Days" ADD COLUMN "Index" integer NOT NULL;
ALTER TABLE "Days" ADD CONSTRAINT "Days_Index_unique" UNIQUE ("Index");
ALTER TABLE "Days" ADD COLUMN "Date" timestamp(3) NOT NULL;
--> statement-breakpoint

-- Seasons: drop mongoId (historical Mongo migration tracking, no longer
-- needed) and the Calendar FK (redundant once Calendar is a singleton -
-- "current season cycle" is now just Season.Year).
ALTER TABLE "Seasons" DROP CONSTRAINT IF EXISTS "Seasons_Calendar_Calendars__id_fk";
ALTER TABLE "Seasons" DROP CONSTRAINT IF EXISTS "Seasons_mongoId_unique";
ALTER TABLE "Seasons" DROP COLUMN IF EXISTS "mongoId";
ALTER TABLE "Seasons" DROP COLUMN IF EXISTS "Calendar";
--> statement-breakpoint

-- Fixtures: own their schedule directly instead of being referenced from a
-- Day.Matches array.
ALTER TABLE "Fixtures" ADD COLUMN "ScheduledDay" integer;
ALTER TABLE "Fixtures" ADD COLUMN "ScheduledDate" timestamp(3);
CREATE INDEX "fixtures_scheduled_day_idx" ON "Fixtures" USING btree ("ScheduledDay");
CREATE INDEX "fixtures_season_scheduled_day_idx" ON "Fixtures" USING btree ("Season","ScheduledDay");
