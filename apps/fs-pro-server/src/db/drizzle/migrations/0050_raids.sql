-- 0050_raids.sql
--
-- Wave 2 / P5 (docs/coc-mapping/04 §4.1, §5, §5.1, §5.2, §12; 05 §4). Additive,
-- idempotent, Node-compatible. The async raid: a queue of raids to resolve
-- (offline/defense resolution) and the once-only guard row that makes applying a
-- raid's effects impossible to double (crash-and-retry safe, 05 §4).
--
-- The kill: `RaidResults."RaidId"` is a PRIMARY KEY, so the second write of a
-- raid's effects fails on the unique key and the whole transaction rolls back.
-- Every raid mutation runs in one transaction with the guard insert.
--
-- All timers are absolute UTC timestamps (ResolveAt/ResolvedAt/ShieldUntil/
-- GuardUntil), never durations (04 §12).

-- ---------------------------------------------------------------------------
-- Raids: the durable queue + record of every resolved raid. A raid is queued
-- (Status 'pending') and then resolved inline by the attacker's request, or by
-- the world-worker's DefenseResolution ticker when the inline pass did not
-- finish (a crash between queue and resolve), which is the offline-defense path.
-- `Request` freezes the sim request (incl. the defender's stored Home Grid
-- snapshot) so resolution is deterministic and the defender snapshot is fixed
-- at raid time (05 §6).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Raids" (
  "_id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "FixtureId"      uuid REFERENCES "Fixtures"("_id"),
  "AttackerClubId" uuid NOT NULL REFERENCES "Clubs"("_id"),
  "DefenderClubId" uuid NOT NULL REFERENCES "Clubs"("_id"),
  "Seed"           text NOT NULL,
  "Practice"       boolean NOT NULL DEFAULT false,
  "Watch"          boolean NOT NULL DEFAULT false,
  "Status"         text NOT NULL DEFAULT 'pending',
  "Request"        jsonb,
  "Result"         jsonb,
  "ResolveAt"      timestamp(3) NOT NULL DEFAULT now(),
  "ResolvedAt"     timestamp(3),
  "createdAt"      timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"      timestamp(3) NOT NULL DEFAULT now()
);

-- The worker's hot path: pending raids that are due.
CREATE INDEX IF NOT EXISTS "raids_pending_idx"
  ON "Raids" ("ResolveAt") WHERE "Status" = 'pending';

-- The defender's inbox/defense log read path.
CREATE INDEX IF NOT EXISTS "raids_defender_idx"
  ON "Raids" ("DefenderClubId", "createdAt" DESC);

-- ---------------------------------------------------------------------------
-- RaidResults: the once-only effect guard + the defense log. One row per
-- resolved raid; the PK is the idempotency key.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "RaidResults" (
  "RaidId"           uuid PRIMARY KEY REFERENCES "Raids"("_id"),
  "AttackerClubId"   uuid NOT NULL REFERENCES "Clubs"("_id"),
  "DefenderClubId"   uuid NOT NULL REFERENCES "Clubs"("_id"),
  "Practice"         boolean NOT NULL DEFAULT false,
  "Stars"            integer NOT NULL DEFAULT 0,
  "AttackerGoals"    integer NOT NULL DEFAULT 0,
  "DefenderGoals"    integer NOT NULL DEFAULT 0,
  "Dominance"        real NOT NULL DEFAULT 0,
  "StolenCash"       real NOT NULL DEFAULT 0,
  "StolenFans"       integer NOT NULL DEFAULT 0,
  "StolenTokens"     integer NOT NULL DEFAULT 0,
  "SystemBonus"      real NOT NULL DEFAULT 0,
  "StandingAttacker" integer NOT NULL DEFAULT 0,
  "StandingDefender" integer NOT NULL DEFAULT 0,
  "ShieldUntil"      timestamp(3),
  "GuardUntil"       timestamp(3),
  "ResolvedAt"       timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "raid_results_defender_idx"
  ON "RaidResults" ("DefenderClubId", "ResolvedAt" DESC);
