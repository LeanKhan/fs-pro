-- 0051_form_bonus.sql
--
-- Wave 3 / P6 (docs/coc-mapping/04 §5.3, 02 §I; 05 §8 "Ladder"). Additive,
-- idempotent, Node-compatible. The Form Bonus: earn 5★ within a rolling ~24h
-- window and the club is credited bonus loot into its Board Vault; the window
-- resets after the 5th star.
--
-- One row per club. `Entries` is the rolling window's star events
-- ([{raidId, at, stars}]); the raidId makes accrual idempotent (a re-processed
-- raid is a no-op). `EarnedAt` marks an earned-but-uncollected bonus as an
-- absolute UTC timestamp (04 §12); `Credited` is the loot already banked.
--
-- StandingLeagues / StandingPools / StandingResults already exist (0048_ladder);
-- the rollover keys its once-only guard on StandingResults (WeekKey, ClubId).

CREATE TABLE IF NOT EXISTS "FormBonus" (
  "ClubId"    uuid PRIMARY KEY REFERENCES "Clubs"("_id"),
  "Entries"   jsonb NOT NULL DEFAULT '[]'::jsonb,
  "EarnedAt"  timestamp(3),
  "Credited"  real NOT NULL DEFAULT 0,
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);
