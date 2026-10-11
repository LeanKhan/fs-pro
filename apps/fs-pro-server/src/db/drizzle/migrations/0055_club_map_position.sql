-- 0055_club_map_position.sql
--
-- A club's own spot on the world map. Until now every club was drawn at its
-- district's point (Places.MapX/MapY), so a town's clubs stacked on one pin.
-- Founding now scatters each new club around its town; NULL keeps the old
-- behaviour (the tiles query falls back to the district point).
--
-- Additive-safe / idempotent.

ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "MapX" real;
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "MapY" real;

-- Tile invalidation (0040) now follows the club's own point, falling back to
-- its district's, and also fires when the point moves. Both the old and the
-- new point's cells are bumped so neither keeps a stale cached tile.
CREATE OR REPLACE FUNCTION "bump_tile_revisions_at"(mx real, my real) RETURNS void AS $$
DECLARE
  lvl int;
  cs real;
BEGIN
  IF mx IS NULL OR my IS NULL THEN
    RETURN;
  END IF;
  FOR lvl IN 0..5 LOOP
    cs := 256.0 / power(2, lvl);
    INSERT INTO "TileRevisions" ("z", "x", "y", "rev")
    VALUES (lvl, floor(mx / cs)::int, floor(my / cs)::int, 1)
    ON CONFLICT ("z", "x", "y") DO UPDATE SET "rev" = "TileRevisions"."rev" + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "bump_tile_revisions_for_club"() RETURNS trigger AS $$
DECLARE
  mx real;
  my real;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    SELECT COALESCE(NEW."MapX", p."MapX"), COALESCE(NEW."MapY", p."MapY") INTO mx, my
    FROM (SELECT 1) one LEFT JOIN "Places" p ON p."_id" = NEW."DistrictId";
    PERFORM "bump_tile_revisions_at"(mx, my);
  END IF;
  IF TG_OP <> 'INSERT' THEN
    SELECT COALESCE(OLD."MapX", p."MapX"), COALESCE(OLD."MapY", p."MapY") INTO mx, my
    FROM (SELECT 1) one LEFT JOIN "Places" p ON p."_id" = OLD."DistrictId";
    PERFORM "bump_tile_revisions_at"(mx, my);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Clubs_tile_revisions" ON "Clubs";
CREATE TRIGGER "Clubs_tile_revisions"
AFTER INSERT OR DELETE OR UPDATE OF "DistrictId", "MapX", "MapY" ON "Clubs"
FOR EACH ROW EXECUTE FUNCTION "bump_tile_revisions_for_club"();
