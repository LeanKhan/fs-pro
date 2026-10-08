-- 0040_tile_revisions_trigger.sql
--
-- Tile invalidation (docs/perfect/WORLD-HIERARCHY-SPEC.md §7.5): bump the
-- TileRevisions counter for every quadtree cell (z0..z5) that contains a
-- club's district whenever the club is founded, released, or moves.
--
-- Same source-of-truth choice as PlaceStats (DECISIONS Q6): a trigger on
-- Clubs, so any writer (Node or Go) is covered and the application cannot
-- forget to invalidate. The quadkey basis (BaseCell 256, each level halves)
-- matches services/world-service/internal/tiles.

CREATE OR REPLACE FUNCTION "bump_tile_revisions_for_club"() RETURNS trigger AS $$
DECLARE
  mx real;
  my real;
  lvl int;
  cs real;
BEGIN
  SELECT "MapX", "MapY" INTO mx, my
  FROM "Places"
  WHERE "_id" = COALESCE(NEW."DistrictId", OLD."DistrictId");

  IF mx IS NULL OR my IS NULL THEN
    RETURN NULL;
  END IF;

  FOR lvl IN 0..5 LOOP
    cs := 256.0 / power(2, lvl);
    INSERT INTO "TileRevisions" ("z", "x", "y", "rev")
    VALUES (lvl, floor(mx / cs)::int, floor(my / cs)::int, 1)
    ON CONFLICT ("z", "x", "y") DO UPDATE SET "rev" = "TileRevisions"."rev" + 1;
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Clubs_tile_revisions" ON "Clubs";
CREATE TRIGGER "Clubs_tile_revisions"
AFTER INSERT OR DELETE OR UPDATE OF "DistrictId" ON "Clubs"
FOR EACH ROW EXECUTE FUNCTION "bump_tile_revisions_for_club"();

-- Backfill: bump for every existing club so tiles invalidate from a real rev
-- rather than starting at 0 (which would let a stale client cache win).
INSERT INTO "TileRevisions" ("z", "x", "y", "rev")
SELECT z,
       floor(cl."MapX" / (256.0 / power(2, z)))::int,
       floor(cl."MapY" / (256.0 / power(2, z)))::int,
       count(*)::bigint
FROM "Clubs" c
JOIN "Places" cl ON cl."_id" = c."DistrictId"
CROSS JOIN generate_series(0, 5) AS z
WHERE cl."MapX" IS NOT NULL
GROUP BY 1, 2, 3
ON CONFLICT ("z", "x", "y") DO UPDATE SET "rev" = "TileRevisions"."rev" + EXCLUDED."rev";
