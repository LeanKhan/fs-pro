-- Batch 2E: two indexes that remove the O(N) scans on the founding and draw
-- paths at scale (found by sub-agent 2E on the 100k run).
--
--   Clubs.UserId            -> the per-user club-cap count during founding.
--   Entries(SeasonId, Group) -> joinPyramid's `members` lookup.
--
-- Both are pure additive indexes: no data change, safe to re-run.

CREATE INDEX IF NOT EXISTS "Clubs_UserId_idx" ON "Clubs" ("UserId");

CREATE INDEX IF NOT EXISTS "Entries_SeasonId_Group_idx" ON "Entries" ("SeasonId", "Group");
