-- Open play: each entry's final result (for the board's performance score)
-- and each year's day range on its report (docs/OPEN-PLAY-COMPETITIONS-SPEC.md).
ALTER TABLE "Entries" ADD COLUMN IF NOT EXISTS "FinalPosition" integer;
ALTER TABLE "Entries" ADD COLUMN IF NOT EXISTS "FinishScore" real;
ALTER TABLE "SeasonReports" ADD COLUMN IF NOT EXISTS "FromDay" integer;
ALTER TABLE "SeasonReports" ADD COLUMN IF NOT EXISTS "ToDay" integer;
