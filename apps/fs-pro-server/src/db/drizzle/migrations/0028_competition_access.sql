-- Open play: qualify/bar outcomes (docs/OPEN-PLAY-COMPETITIONS-SPEC.md).
-- Kind 'qualified': the club is invited to the target competition's next
-- edition that hasn't started (Used once the invite is made).
-- Kind 'barred': the club can't enter the target's editions numbered up to
-- UntilEditionNumber.
CREATE TABLE IF NOT EXISTS "CompetitionAccess" (
  "_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ClubId" uuid NOT NULL REFERENCES "Clubs"("_id"),
  "CompetitionId" uuid NOT NULL REFERENCES "Competitions"("_id"),
  "Kind" text NOT NULL,
  "UntilEditionNumber" integer,
  "Used" boolean NOT NULL DEFAULT false,
  "SourceSeasonId" uuid REFERENCES "Seasons"("_id"),
  "createdAt" timestamp(3) DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "competition_access_target_idx"
  ON "CompetitionAccess" ("CompetitionId", "Kind", "Used");
CREATE INDEX IF NOT EXISTS "competition_access_club_idx"
  ON "CompetitionAccess" ("ClubId");
