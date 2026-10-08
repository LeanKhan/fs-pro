-- 0041_clubs_district_index.sql
--
-- The tile queries (services/world-service/internal/tiles) drive from Places
-- using a sargable MapX/MapY range (index "Places_map_idx", migration 0038) and
-- join Clubs on "DistrictId". Postgres does not auto-index foreign keys, so
-- without this index the planner hash-joins every club in the world for each
-- tile and tile cost grows with world size (the D1 risk at 1M clubs).
--
-- (DistrictId, Prominence DESC) covers both the join and the per-place
-- prominence ordering the tile payload needs.

CREATE INDEX IF NOT EXISTS "Clubs_DistrictId_Prominence_idx"
  ON "Clubs" ("DistrictId", "Prominence" DESC);

-- Prominence ranking also filters released clubs by district; a partial index
-- for the active set keeps the tile join tight.
CREATE INDEX IF NOT EXISTS "Clubs_active_DistrictId_idx"
  ON "Clubs" ("DistrictId")
  WHERE "ReleasedAt" IS NULL;
