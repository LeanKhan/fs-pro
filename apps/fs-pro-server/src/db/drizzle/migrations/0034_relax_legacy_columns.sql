-- Until 0031 drops the scheduled-season columns, they must not block new
-- open-play rows: drop their NOT NULLs if they still exist. A no-op once
-- 0031 has run. Idempotent and reversible (no data is touched).
DO $$
DECLARE
  col record;
BEGIN
  FOR col IN
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND is_nullable = 'NO' AND (
      (table_name = 'Competitions' AND column_name IN ('League', 'Cup', 'Tournament', 'Division', 'NumberOfTeams', 'NumberOfWeeks', 'TeamsPromoted', 'TeamsRelegated', 'CountryId', 'Tier', 'Pod'))
      OR (table_name = 'Seasons' AND column_name IN ('Standings', 'Year', 'Promoted', 'Relegated', 'isStarted', 'isFinished'))
      OR (table_name = 'Fixtures' AND column_name = 'Week')
      OR (table_name = 'Clubs' AND column_name IN ('LeagueId', 'LeagueCode'))
    )
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', col.table_name, col.column_name);
    RAISE NOTICE 'relaxed %.%', col.table_name, col.column_name;
  END LOOP;
END $$;
