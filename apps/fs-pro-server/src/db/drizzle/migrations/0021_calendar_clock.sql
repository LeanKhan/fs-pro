ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "ClockMode" text NOT NULL DEFAULT 'paused';
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "NextTickAt" timestamp(3);
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "LastTickAt" timestamp(3);
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "MatchdaySlotMinutes" integer NOT NULL DEFAULT 180;
ALTER TABLE "Calendars" ADD COLUMN IF NOT EXISTS "OffDaySlotMinutes" integer NOT NULL DEFAULT 10;
