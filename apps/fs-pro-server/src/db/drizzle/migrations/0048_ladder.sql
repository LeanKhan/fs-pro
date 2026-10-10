-- 0048_ladder.sql
--
-- Wave 1 / P0 (docs/coc-mapping/05 §8 "Ladder"; 04 §4). Additive, idempotent,
-- Node-compatible. Standing Leagues, the weekly tournament pools and the
-- per-week results. The 22 rungs are seeded to match internal/league/league.go
-- exactly (18 divisions + Legend), so the pure core and the DB agree.

CREATE TABLE IF NOT EXISTS "StandingLeagues" (
  "Code"           text PRIMARY KEY,
  "Name"           text NOT NULL,
  "Division"       integer NOT NULL DEFAULT 0,
  "LowerBound"     integer NOT NULL,
  "MultiplierX100" integer NOT NULL DEFAULT 100,
  "CreatedAt"      timestamp(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "StandingPools" (
  "_id"        uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "LeagueCode" text NOT NULL REFERENCES "StandingLeagues"("Code"),
  "WeekKey"    text NOT NULL,
  "ClubId"     uuid NOT NULL REFERENCES "Clubs"("_id"),
  "Pool"       integer NOT NULL DEFAULT 0,
  "Attacks"    integer NOT NULL DEFAULT 0,
  "Defenses"   integer NOT NULL DEFAULT 0,
  "Stars"      integer NOT NULL DEFAULT 0,
  "Placement"  integer,
  "createdAt"  timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"  timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "standing_pools_week_club_uniq" UNIQUE ("WeekKey", "ClubId")
);

CREATE TABLE IF NOT EXISTS "StandingResults" (
  "_id"        uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ClubId"     uuid NOT NULL REFERENCES "Clubs"("_id"),
  "WeekKey"    text NOT NULL,
  "LeagueCode" text NOT NULL REFERENCES "StandingLeagues"("Code"),
  "Delta"      integer NOT NULL DEFAULT 0,
  "Standing"   integer NOT NULL DEFAULT 0,
  "Outcome"    text NOT NULL,
  "createdAt"  timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"  timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "standing_results_week_club_uniq" UNIQUE ("WeekKey", "ClubId")
);

CREATE INDEX IF NOT EXISTS "standing_pools_pool_idx" ON "StandingPools" ("WeekKey", "Pool");

-- Seed the 22-rung ladder (04 §4.2). Values mirror internal/league.Leagues; a
-- multiplier of 1.10 is stored as 110 (basis x100).
INSERT INTO "StandingLeagues" ("Code", "Name", "Division", "LowerBound", "MultiplierX100") VALUES
  ('bronze_3',    'Bronze',   3,  400, 100),
  ('bronze_2',    'Bronze',   2,  500, 105),
  ('bronze_1',    'Bronze',   1,  600, 110),
  ('silver_3',    'Silver',   3,  800, 115),
  ('silver_2',    'Silver',   2,  900, 120),
  ('silver_1',    'Silver',   1, 1000, 125),
  ('gold_3',      'Gold',     3, 1200, 130),
  ('gold_2',      'Gold',     2, 1300, 135),
  ('gold_1',      'Gold',     1, 1400, 140),
  ('crystal_3',   'Crystal',  3, 1600, 145),
  ('crystal_2',   'Crystal',  2, 1700, 150),
  ('crystal_1',   'Crystal',  1, 1800, 155),
  ('master_3',    'Master',   3, 2000, 160),
  ('master_2',    'Master',   2, 2100, 165),
  ('master_1',    'Master',   1, 2200, 170),
  ('champion_3',  'Champion', 3, 2400, 175),
  ('champion_2',  'Champion', 2, 2500, 180),
  ('champion_1',  'Champion', 1, 2600, 185),
  ('titan_3',     'Titan',    3, 2800, 190),
  ('titan_2',     'Titan',    2, 2900, 195),
  ('titan_1',     'Titan',    1, 3000, 200),
  ('legend',      'Legend',   0, 3200, 210)
ON CONFLICT ("Code") DO NOTHING;
