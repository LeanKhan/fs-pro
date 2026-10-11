-- 0049_association.sql
--
-- Wave 1 / P0 (docs/coc-mapping/05 §8 "Social"; 02 §G; 04 §6-§7). Additive,
-- idempotent, Node-compatible. The Association is the CoC Clan (<=50 clubs):
-- members, loans, perks, the Derby lifecycle, the Association League bracket,
-- weekly Directives and the shared Association Grounds / Festival Weekend.

CREATE TABLE IF NOT EXISTS "Associations" (
  "_id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "Name"        text NOT NULL UNIQUE,
  "Tag"         text NOT NULL UNIQUE,
  "Description" text,
  "Level"       integer NOT NULL DEFAULT 1,
  "Xp"          integer NOT NULL DEFAULT 0,
  "Region"      text,
  "Open"        boolean NOT NULL DEFAULT true,
  "createdAt"   timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"   timestamp(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "AssociationMembers" (
  "_id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "AssociationId" uuid NOT NULL REFERENCES "Associations"("_id"),
  "ClubId"        uuid NOT NULL REFERENCES "Clubs"("_id"),
  "Role"          text NOT NULL DEFAULT 'member',
  "createdAt"     timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"     timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "association_members_club_uniq" UNIQUE ("ClubId")
);

CREATE INDEX IF NOT EXISTS "association_members_assoc_idx" ON "AssociationMembers" ("AssociationId");

-- Loans (02 §G): a cross-club temporary player. Real-time window ends at DueAt.
CREATE TABLE IF NOT EXISTS "AssociationLoans" (
  "_id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "AssociationId" uuid NOT NULL REFERENCES "Associations"("_id"),
  "PlayerId"      uuid NOT NULL REFERENCES "Players"("_id"),
  "FromClubId"    uuid NOT NULL REFERENCES "Clubs"("_id"),
  "ToClubId"      uuid NOT NULL REFERENCES "Clubs"("_id"),
  "DueAt"         timestamp(3) NOT NULL,
  "ReturnedAt"    timestamp(3),
  "createdAt"     timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"     timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "association_loans_open_idx"
  ON "AssociationLoans" ("AssociationId") WHERE "ReturnedAt" IS NULL;

-- Derby (02 §G): a scheduled prep -> matchday event between two associations.
CREATE TABLE IF NOT EXISTS "Derbies" (
  "_id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "HomeAssocId"    uuid NOT NULL REFERENCES "Associations"("_id"),
  "AwayAssocId"    uuid NOT NULL REFERENCES "Associations"("_id"),
  "Phase"          text NOT NULL DEFAULT 'prep',
  "PrepStartsAt"   timestamp(3) NOT NULL,
  "BattleStartsAt" timestamp(3) NOT NULL,
  "EndsAt"         timestamp(3) NOT NULL,
  "HomeStars"      integer NOT NULL DEFAULT 0,
  "AwayStars"      integer NOT NULL DEFAULT 0,
  "HomeDestruction" real NOT NULL DEFAULT 0,
  "AwayDestruction" real NOT NULL DEFAULT 0,
  "CompletedAt"    timestamp(3),
  "createdAt"      timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"      timestamp(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "DerbyMatches" (
  "_id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "DerbyId"      uuid NOT NULL REFERENCES "Derbies"("_id"),
  "AttackerClubId" uuid NOT NULL REFERENCES "Clubs"("_id"),
  "DefenderClubId" uuid NOT NULL REFERENCES "Clubs"("_id"),
  "Attempt"      integer NOT NULL DEFAULT 1,
  "Stars"        integer NOT NULL DEFAULT 0,
  "Destruction"  real NOT NULL DEFAULT 0,
  "ResolvedAt"   timestamp(3),
  "createdAt"    timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"    timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "derby_matches_derby_attacker_attempt_uniq"
    UNIQUE ("DerbyId", "AttackerClubId", "Attempt")
);

-- Association League: a season-long bracket of associations (02 §G).
CREATE TABLE IF NOT EXISTS "AssociationLeagueSeasons" (
  "_id"        uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "SeasonKey"  text NOT NULL UNIQUE,
  "StartsAt"   timestamp(3) NOT NULL,
  "EndsAt"     timestamp(3) NOT NULL,
  "createdAt"  timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"  timestamp(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "AssociationLeagueStandings" (
  "_id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "SeasonKey"     text NOT NULL,
  "AssociationId" uuid NOT NULL REFERENCES "Associations"("_id"),
  "GroupIndex"    integer NOT NULL DEFAULT 0,
  "Stars"         integer NOT NULL DEFAULT 0,
  "Placement"     integer,
  "createdAt"     timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"     timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "assoc_league_standings_season_assoc_uniq" UNIQUE ("SeasonKey", "AssociationId")
);

-- Directives: weekly shared objectives; progress is once-per-member-per-tier
-- (02 §G, 04 §7).
CREATE TABLE IF NOT EXISTS "Directives" (
  "_id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "AssociationId" uuid NOT NULL REFERENCES "Associations"("_id"),
  "WeekKey"       text NOT NULL,
  "Code"          text NOT NULL,
  "Title"         text NOT NULL,
  "Tier"          integer NOT NULL DEFAULT 1,
  "Goal"          integer NOT NULL DEFAULT 1,
  "Rewards"       jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt"     timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"     timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "directives_assoc_week_code_uniq" UNIQUE ("AssociationId", "WeekKey", "Code")
);

CREATE TABLE IF NOT EXISTS "DirectiveProgress" (
  "_id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "DirectiveId"   uuid NOT NULL REFERENCES "Directives"("_id"),
  "ClubId"        uuid NOT NULL REFERENCES "Clubs"("_id"),
  "Progress"      integer NOT NULL DEFAULT 0,
  "ClaimedTier"   integer NOT NULL DEFAULT 0,
  "createdAt"     timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"     timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "directive_progress_directive_club_uniq" UNIQUE ("DirectiveId", "ClubId")
);

-- Association Grounds + Festival Weekend (02 §G): shared co-op build, weekly
-- Fri 07:00 -> Mon 07:00 UTC raid event.
CREATE TABLE IF NOT EXISTS "AssociationGrounds" (
  "_id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "AssociationId" uuid NOT NULL UNIQUE REFERENCES "Associations"("_id"),
  "Level"         integer NOT NULL DEFAULT 1,
  "CapitalGold"   real NOT NULL DEFAULT 0,
  "Layout"        jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updatedAt"     timestamp(3) NOT NULL DEFAULT now()
);
