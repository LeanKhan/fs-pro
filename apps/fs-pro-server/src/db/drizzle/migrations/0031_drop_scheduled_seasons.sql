-- Drop what scheduled seasons left behind (docs/OPEN-PLAY-COMPETITIONS-SPEC.md,
-- "Removed"). Run only after the open-play data script has converted every
-- competition and season (run-0031-migration.ts checks that first).
-- Idempotent.
ALTER TABLE "Seasons"
  DROP COLUMN IF EXISTS "Standings",
  DROP COLUMN IF EXISTS "Year",
  DROP COLUMN IF EXISTS "Promoted",
  DROP COLUMN IF EXISTS "Relegated",
  DROP COLUMN IF EXISTS "isStarted",
  DROP COLUMN IF EXISTS "isFinished";

ALTER TABLE "Competitions"
  DROP COLUMN IF EXISTS "League",
  DROP COLUMN IF EXISTS "Cup",
  DROP COLUMN IF EXISTS "Tournament",
  DROP COLUMN IF EXISTS "Division",
  DROP COLUMN IF EXISTS "NumberOfTeams",
  DROP COLUMN IF EXISTS "NumberOfWeeks",
  DROP COLUMN IF EXISTS "TeamsPromoted",
  DROP COLUMN IF EXISTS "TeamsRelegated",
  DROP COLUMN IF EXISTS "CountryId",
  DROP COLUMN IF EXISTS "Tier",
  DROP COLUMN IF EXISTS "Pod";

ALTER TABLE "Fixtures" DROP COLUMN IF EXISTS "Week";

ALTER TABLE "Clubs"
  DROP COLUMN IF EXISTS "LeagueId",
  DROP COLUMN IF EXISTS "LeagueCode";

DROP TABLE IF EXISTS "CompetitionClubs";
