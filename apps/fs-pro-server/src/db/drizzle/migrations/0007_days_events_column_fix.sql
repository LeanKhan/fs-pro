-- Fixes an omission in 0006_calendar_fixture_redesign.sql: the "Days" table
-- was supposed to gain an "Events" column (it never existed on the old
-- Mongo-derived schema either) but the ALTER TABLE statement was missing.
ALTER TABLE "Days" ADD COLUMN "Events" jsonb NOT NULL DEFAULT '[]'::jsonb;
