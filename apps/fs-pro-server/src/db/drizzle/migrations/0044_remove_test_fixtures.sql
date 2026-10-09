-- 0044_remove_test_fixtures.sql
--
-- QA fixtures leaked from the dev database into a shared playtest world and
-- were visible to players (UX pass U-09): a Postgres test player named
-- "HTTP PgTest" (Rating 0, Value V0) that topped every "cheapest free agent"
-- list, and the E2E suite's clubs/managers (tests/e2e core-loop.spec.ts names
-- them "E2E United <stamp>" and "E2E Manager").
--
-- Free-agent fixtures are deleted (only when nothing references them). E2E
-- clubs are soft-released instead of deleted, so matchmaking
-- (`isNull(Clubs.ReleasedAt)` in play.service.ts) skips them while their
-- fixtures/history stay intact. Their manager is released back to the pool.
--
-- Deliberately narrow and idempotent: the names are unambiguous test artifacts,
-- so this is safe to ship and to re-run.

DELETE FROM "Players" p
WHERE p."ClubId" IS NULL
  AND p."isSigned" = false
  AND (p."FirstName" ILIKE '%pgtest%' OR p."LastName" ILIKE '%pgtest%')
  AND NOT EXISTS (SELECT 1 FROM "TransferLedger" tl WHERE tl."PlayerId" = p."_id");

UPDATE "Clubs"
SET "ReleasedAt" = now(), "updatedAt" = now()
WHERE "ReleasedAt" IS NULL AND "Name" LIKE 'E2E United %';

UPDATE "Managers"
SET "isEmployed" = false, "ClubId" = NULL, "updatedAt" = now()
WHERE "FirstName" = 'E2E' AND "LastName" = 'Manager';
